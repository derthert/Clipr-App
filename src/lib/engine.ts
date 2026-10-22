// One entry point for rendering: the bundled ffmpeg binary on desktop (for single-file cuts),
// or the multi-segment composition renderer in ffmpeg.wasm.

import type { CompositionPiece, ExportSettings, TextSegment } from '../types'
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
  pieces?: CompositionPiece[]
  textSegments?: TextSegment[]
  settings: ExportSettings
  extension: string
  sourceWidth?: number
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

// Jobs currently handled by the desktop ffmpeg binary. Canceling one of them must not
// terminate the shared ffmpeg.wasm engine, which timeline and text exports still rely on.
const desktopJobs = new Set<string>()

export async function renderClip(request: ClipRequest): Promise<ClipResult> {
  const isMultiPiece =
    Boolean(request.pieces) &&
    ((request.pieces?.length ?? 0) > 1 || request.pieces?.[0]?.kind === 'gap')
  const hasTexts = (request.textSegments?.length ?? 0) > 0
  const effectiveSettings: ExportSettings = { ...request.settings, mode: 'precise' }

  try {
    if (desktop && request.sourcePath && !isMultiPiece && !hasTexts) {
      desktopJobs.add(request.id)
      const result = await desktop.run(
        {
          id: request.id,
          args: buildFfmpegArgs({
            input: '@INPUT@',
            output: '@OUTPUT@',
            start: request.start,
            end: request.end,
            settings: effectiveSettings,
            sourceHeight: request.sourceHeight,
          }),
          sourcePath: request.sourcePath,
          fileName: request.fileName,
          duration: request.end - request.start,
        },
        request.onProgress,
      ).finally(() => desktopJobs.delete(request.id))
      if (result.canceled) throw new CanceledError()
      if (!result.ok) {
        throw new Error(result.error ?? 'FFmpeg işlemi başarısız oldu')
      }
      return { path: result.path, size: result.size ?? 0 }
    }

    const blob = await renderWithWasm({
      file: request.file,
      start: request.start,
      end: request.end,
      pieces: request.pieces,
      textSegments: request.textSegments,
      settings: effectiveSettings,
      extension: request.extension,
      sourceWidth: request.sourceWidth,
      sourceHeight: request.sourceHeight,
      onProgress: request.onProgress,
    })
    return { url: URL.createObjectURL(blob), size: blob.size }
  } catch (error) {
    if (error instanceof CanceledError) throw error
    console.error('[Export Engine Hatası]', error)
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      detail.startsWith('Dışa Aktarma Başarısız')
        ? detail
        : `Dışa Aktarma Başarısız: ${detail}`,
    )
  }
}

export function cancelRender(id: string): void {
  if (desktop && desktopJobs.has(id)) void desktop.cancel(id)
  else cancelWasm()
}
