// One entry point for rendering: the bundled ffmpeg binary on desktop, WebAssembly on the web.

import type { ExportSettings } from '../types'
import { desktop } from './desktop'
import { cancelRender as cancelWasm, renderClip as renderWithWasm } from './ffmpeg'
import { buildFfmpegArgs } from './settings'

export interface ClipRequest {
  id: string
  file: File
  sourcePath?: string
  fileName: string
  start: number
  end: number
  settings: ExportSettings
  extension: string
  sourceHeight?: number
  onProgress?: (ratio: number) => void
}

export interface ClipResult {
  url?: string
  path?: string
  size: number
}

export class CanceledError extends Error {
  constructor() {
    super('Canceled')
    this.name = 'CanceledError'
  }
}

export async function renderClip(request: ClipRequest): Promise<ClipResult> {
  if (desktop && request.sourcePath) {
    const result = await desktop.run(
      {
        id: request.id,
        args: buildFfmpegArgs({
          input: '@INPUT@',
          output: '@OUTPUT@',
          start: request.start,
          end: request.end,
          settings: request.settings,
          sourceHeight: request.sourceHeight,
        }),
        sourcePath: request.sourcePath,
        fileName: request.fileName,
        duration: request.end - request.start,
      },
      request.onProgress,
    )
    if (result.canceled) throw new CanceledError()
    if (!result.ok) throw new Error(result.error ?? 'ffmpeg failed')
    return { path: result.path, size: result.size ?? 0 }
  }

  const blob = await renderWithWasm({
    file: request.file,
    start: request.start,
    end: request.end,
    settings: request.settings,
    extension: request.extension,
    sourceHeight: request.sourceHeight,
    onProgress: request.onProgress,
  })
  return { url: URL.createObjectURL(blob), size: blob.size }
}

export function cancelRender(id: string): void {
  if (desktop) void desktop.cancel(id)
  else cancelWasm()
}
