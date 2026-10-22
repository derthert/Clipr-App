// Runs the export pipeline on the desktop app's bundled ffmpeg binary instead of
// ffmpeg.wasm. It mirrors the slice of the FFmpeg class the pipeline uses, so ffmpeg.ts
// drives both the same way. Files live in a per-job temp folder owned by the main process.

import type { FFmpeg } from '@ffmpeg/ffmpeg'
import type { DesktopBridge, WorkspaceOutput } from './desktop'
import { extensionOf } from './file'

/** The part of the FFmpeg class the export pipeline relies on. */
export type PipelineEngine = Pick<FFmpeg, 'on' | 'off' | 'exec' | 'writeFile' | 'deleteFile'>

type LogListener = (event: { type: string; message: string }) => void
type ProgressListener = (event: { progress: number; time: number }) => void

export class NativeEngine implements PipelineEngine {
  private readonly logListeners = new Set<LogListener>()
  private readonly progressListeners = new Set<ProgressListener>()
  private inputCount = 0
  private canceled = false

  private constructor(
    private readonly bridge: DesktopBridge,
    private readonly jobId: string,
  ) {}

  static async open(bridge: DesktopBridge, jobId: string): Promise<NativeEngine> {
    await bridge.workspace.open(jobId)
    return new NativeEngine(bridge, jobId)
  }

  on(event: 'log', callback: LogListener): void
  on(event: 'progress', callback: ProgressListener): void
  on(event: 'log' | 'progress', callback: LogListener | ProgressListener): void {
    if (event === 'log') this.logListeners.add(callback as LogListener)
    else this.progressListeners.add(callback as ProgressListener)
  }

  off(event: 'log', callback: LogListener): void
  off(event: 'progress', callback: ProgressListener): void
  off(event: 'log' | 'progress', callback: LogListener | ProgressListener): void {
    if (event === 'log') this.logListeners.delete(callback as LogListener)
    else this.progressListeners.delete(callback as ProgressListener)
  }

  async exec(args: string[]): Promise<number> {
    if (this.canceled) throw new Error('Export canceled')
    const result = await this.bridge.workspace.exec(this.jobId, args, (output: WorkspaceOutput) => {
      for (const message of output.logs) {
        for (const listener of this.logListeners) listener({ type: 'stderr', message })
      }
      if (output.time !== undefined) {
        // Same unit as ffmpeg.wasm progress events: microseconds.
        const event = { progress: 0, time: output.time * 1_000_000 }
        for (const listener of this.progressListeners) listener(event)
      }
    })
    if (result.canceled) {
      // Stop the pipeline instead of letting a fallback step start a new ffmpeg run.
      this.canceled = true
      throw new Error('Export canceled')
    }
    if (result.error) {
      for (const listener of this.logListeners) listener({ type: 'stderr', message: result.error })
    }
    return result.code
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<boolean> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    await this.bridge.workspace.write(this.jobId, path, bytes)
    return true
  }

  async deleteFile(path: string): Promise<boolean> {
    await this.bridge.workspace.remove(this.jobId, path)
    return true
  }

  /** The source file on disk, or a copy in the workspace when it has no path (rare). */
  async inputPath(file: File): Promise<string> {
    const onDisk = this.bridge.pathForFile(file)
    if (onDisk) return onDisk
    const name = `input_${this.inputCount++}.${extensionOf(file.name) || 'bin'}`
    await this.writeFile(name, new Uint8Array(await file.arrayBuffer()))
    return name
  }

  /** Moves the finished output next to the source video and reports where it went. */
  finish(name: string, fileName: string, sourcePath?: string): Promise<{ path: string; size: number }> {
    return this.bridge.workspace.finish(this.jobId, name, fileName, sourcePath)
  }

  close(): Promise<void> {
    return this.bridge.workspace.close(this.jobId)
  }
}
