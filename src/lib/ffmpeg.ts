// Single ffmpeg.wasm engine shared by every export, plus a tiny status store for the UI.

import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import type { ExportSettings } from '../types'
import { buildFfmpegArgs, mimeForExtension } from './settings'
import { clamp } from './time'
import { extensionOf } from './file'

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error'

const MOUNT_DIR = '/clipr'
const listeners = new Set<(status: EngineStatus) => void>()

let engine: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let status: EngineStatus = 'idle'
let chain: Promise<unknown> = Promise.resolve()

function setStatus(next: EngineStatus) {
  status = next
  for (const listener of listeners) listener(next)
}

export function getEngineStatus(): EngineStatus {
  return status
}

export function subscribeEngine(listener: (status: EngineStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function coreUrl(file: string): string {
  return new URL(`${import.meta.env.BASE_URL}ffmpeg/${file}`, document.baseURI).href
}

async function createEngine(): Promise<FFmpeg> {
  const instance = new FFmpeg()
  await instance.load({ coreURL: coreUrl('ffmpeg-core.js'), wasmURL: coreUrl('ffmpeg-core.wasm') })
  return instance
}

export function ensureEngine(): Promise<FFmpeg> {
  if (engine) return Promise.resolve(engine)
  if (!loading) {
    setStatus('loading')
    loading = createEngine()
      .then((instance) => {
        engine = instance
        setStatus('ready')
        return instance
      })
      .catch((error: unknown) => {
        loading = null
        setStatus('error')
        throw error
      })
  }
  return loading
}

export function cancelRender(): void {
  if (!engine && !loading) return
  engine?.terminate()
  engine = null
  loading = null
  setStatus('idle')
}

async function mountInput(instance: FFmpeg, file: File) {
  try {
    await instance.createDir(MOUNT_DIR).catch(() => undefined)
    await instance.unmount(MOUNT_DIR).catch(() => undefined)
    await instance.mount(FFFSType.WORKERFS, { files: [file] }, MOUNT_DIR)
    return {
      path: `${MOUNT_DIR}/${file.name}`,
      release: async () => {
        await instance.unmount(MOUNT_DIR).catch(() => undefined)
        await instance.deleteDir(MOUNT_DIR).catch(() => undefined)
      },
    }
  } catch {
    const path = `source.${extensionOf(file.name) || 'bin'}`
    await instance.writeFile(path, await fetchFile(file))
    return { path, release: async () => void instance.deleteFile(path).catch(() => undefined) }
  }
}

function describeFailure(logs: string[]): string {
  const meaningful = logs
    .filter((line) => /error|invalid|unable|failed|not found|no such/i.test(line))
    .slice(-2)
  return meaningful.join(' · ') || 'ffmpeg could not produce this clip'
}

export interface RenderRequest {
  file: File
  start: number
  end: number
  settings: ExportSettings
  extension: string
  sourceHeight?: number
  onProgress?: (ratio: number) => void
}

async function execute(request: RenderRequest): Promise<Blob> {
  const instance = await ensureEngine()
  const output = `clip.${request.extension}`
  const duration = Math.max(0.04, request.end - request.start)
  const logs: string[] = []

  const onLog = ({ message }: { message: string }) => {
    logs.push(message)
    if (logs.length > 40) logs.shift()
  }
  const onProgress = ({ time }: { time: number }) => {
    request.onProgress?.(clamp(time / 1_000_000 / duration, 0, 1))
  }

  instance.on('log', onLog)
  instance.on('progress', onProgress)
  const mounted = await mountInput(instance, request.file)

  try {
    const code = await instance.exec(
      buildFfmpegArgs({
        input: mounted.path,
        output,
        start: request.start,
        end: request.end,
        settings: request.settings,
        sourceHeight: request.sourceHeight,
      }),
    )
    if (code !== 0) throw new Error(describeFailure(logs))
    const data = await instance.readFile(output)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
    if (!bytes.length) throw new Error('ffmpeg produced an empty file')
    return new Blob([bytes as unknown as BlobPart], { type: mimeForExtension(request.extension) })
  } finally {
    instance.off('log', onLog)
    instance.off('progress', onProgress)
    if (engine === instance) {
      await instance.deleteFile(output).catch(() => undefined)
      await mounted.release()
    }
  }
}

export function renderClip(request: RenderRequest): Promise<Blob> {
  const run = chain.then(
    () => execute(request),
    () => execute(request),
  )
  chain = run.catch(() => undefined)
  return run
}

export function previewCommand(request: Omit<RenderRequest, 'file' | 'onProgress'>): string {
  const args = buildFfmpegArgs({
    input: 'input.mp4',
    output: `clip.${request.extension}`,
    start: request.start,
    end: request.end,
    settings: request.settings,
    sourceHeight: request.sourceHeight,
  })
  return `ffmpeg ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`
}
