// One entry point for rendering. Plain single-file cuts on desktop go straight to the
// bundled ffmpeg binary; everything else runs the composition pipeline in ffmpeg.ts, which
// itself uses the bundled binary on desktop and ffmpeg.wasm in the browser.

import type { CompositionPiece, ExportSettings, TextSegment } from '../types'
import { desktop } from './desktop'
import { cancelRender as cancelWasm, renderClip as renderPipeline } from './ffmpeg'
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
// terminate the shared ffmpeg.wasm engine.
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
            preset: 'veryfast',
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

    if (desktop) desktopJobs.add(request.id)
    const output = await renderPipeline({
      id: request.id,
      fileName: request.fileName,
      sourcePath: request.sourcePath,
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
    }).finally(() => desktopJobs.delete(request.id))
    if ('blob' in output) return { url: URL.createObjectURL(output.blob), size: output.blob.size }
    return output
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
