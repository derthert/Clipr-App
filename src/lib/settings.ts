// Export settings, their presets and the ffmpeg argument list they produce.

import type { ExportSettings, Preferences, QualityPreset, ScalePreset } from '../types'
import { timecodeForFileName } from './time'
import { sanitizeFileName } from './file'

export const MIN_CLIP_DURATION = 0.05
export const FILE_NAME_TEMPLATE = '{name}_{start}-{end}'
export const AUDIO_BITRATE = '128k'
export const DEFAULT_FPS = '30'
const CPU_COUNT =
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4
// x264 frame threads. More than 8 crashes the multi-threaded ffmpeg.wasm core.
export const THREAD_COUNT = String(Math.min(8, Math.max(2, CPU_COUNT)))
// Decoder and filter-graph threads, used by the multi-threaded ffmpeg.wasm core. Kept
// low enough that decoder + filters + scalers + x264 stay under its 32-thread pool even
// when a text overlay adds extra scaler threads.
export const DECODE_THREAD_COUNT = String(Math.min(6, Math.max(2, CPU_COUNT)))
export const FILTER_THREAD_COUNT = String(Math.min(2, Math.max(1, Math.floor(CPU_COUNT / 2))))

export const DEFAULT_SETTINGS: ExportSettings = {
  mode: 'precise',
  format: 'mp4',
  quality: 'balanced',
  scale: '720',
  muteAudio: false,
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  loopSelection: true,
  editorProfile: 'full',
}

/**
 * x264 speed preset. The desktop's native ffmpeg uses `veryfast`: smaller files at better
 * quality for about 30% more time. ffmpeg.wasm stays on `ultrafast`: there `veryfast`
 * crashes the multi-threaded core and even `superfast` is 2.6x slower.
 */
export type X264Preset = 'ultrafast' | 'veryfast'

/** Downscaling filter: bicubic is sharper, but doubles the export time in ffmpeg.wasm. */
export function scaleFlags(preset: X264Preset): string {
  return preset === 'veryfast' ? 'bicubic' : 'fast_bilinear'
}

// ultrafast compresses worse, so it needs a higher CRF for similar file sizes.
const QUALITY_CRF: Record<X264Preset, Record<QualityPreset, string>> = {
  veryfast: { high: '20', balanced: '23', small: '28' },
  ultrafast: { high: '24', balanced: '28', small: '30' },
}

const SCALE_HEIGHTS: Record<Exclude<ScalePreset, 'source'>, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
}

/** Reference preview height so text fontSize scales identically between preview and export. */
export const PREVIEW_REF_HEIGHT = 360

/** Output height cap for a scale preset; 'source' keeps the original resolution. */
export function maxOutputHeight(scale: ScalePreset): number | undefined {
  return scale === 'source' ? undefined : SCALE_HEIGHTS[scale]
}

/**
 * H.264 encoder arguments shared by every video export path. CRF alone drives the rate
 * control, with no bitrate cap. No `-tune zerolatency`: it switches x264 to sliced
 * threads, which crash the multi-threaded ffmpeg.wasm core and are slower anyway.
 */
export function x264Args(quality: QualityPreset, preset: X264Preset): string[] {
  return [
    '-r', DEFAULT_FPS,
    '-threads', THREAD_COUNT,
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', QUALITY_CRF[preset][quality],
    '-pix_fmt', 'yuv420p',
  ]
}

export function outputExtension(settings: ExportSettings): string {
  return settings.format
}

export function mimeForExtension(extension: string): string {
  switch (extension) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mkv':
      return 'video/x-matroska'
    case 'mov':
      return 'video/quicktime'
    case 'gif':
      return 'image/gif'
    case 'mp3':
      return 'audio/mpeg'
    default:
      return 'application/octet-stream'
  }
}

function videoFilters(
  settings: ExportSettings,
  preset: X264Preset,
  sourceHeight?: number,
): string[] {
  const filters: string[] = []
  if (settings.format === 'gif') filters.push('fps=12')
  const maxTarget = maxOutputHeight(settings.scale)
  if (maxTarget === undefined) {
    // Original size; H.264 with yuv420p only needs even dimensions.
    filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2')
    return filters
  }
  const height = sourceHeight ? Math.min(sourceHeight, maxTarget) : maxTarget
  const evenHeight = Math.max(2, Math.round(height / 2) * 2)
  filters.push(`scale=-2:${evenHeight}:flags=${scaleFlags(preset)}`)
  return filters
}

export interface CommandInput {
  input: string
  output: string
  start: number
  end: number
  settings: ExportSettings
  sourceHeight?: number
  preset: X264Preset
}

export function buildFfmpegArgs({
  input,
  output,
  start,
  end,
  settings,
  sourceHeight,
  preset,
}: CommandInput): string[] {
  const duration = Math.max(MIN_CLIP_DURATION, end - start)
  const args = [
    '-hide_banner',
    '-ss',
    start.toFixed(3),
    '-i',
    input,
    '-t',
    duration.toFixed(3),
  ]
  const wantsAudio = !settings.muteAudio && settings.format !== 'gif'
  const filters = videoFilters(settings, preset, sourceHeight)

  if (settings.format === 'mp3') {
    args.push('-vn', '-c:a', 'libmp3lame', '-b:a', AUDIO_BITRATE, output)
    return args
  }

  if (settings.format === 'gif') {
    const prepared = [...filters, 'split[sample][frames]'].join(',')
    const chain = [
      prepared,
      '[sample]palettegen=stats_mode=diff[palette]',
      '[frames][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
    ].join(';')
    args.push('-vf', chain, '-an', '-loop', '0', output)
    return args
  }

  args.push('-map', '0:v:0?')
  if (wantsAudio) args.push('-map', '0:a:0?')
  if (filters.length) args.push('-vf', filters.join(','))
  args.push(...x264Args(settings.quality, preset), '-movflags', '+faststart')
  args.push(...(wantsAudio ? ['-c:a', 'aac', '-b:a', AUDIO_BITRATE] : ['-an']))
  args.push(output)
  return args
}

export interface FileNameContext {
  sourceName: string
  start: number
  end: number
  extension: string
}

export function buildFileName(context: FileNameContext): string {
  const tokens: Record<string, string> = {
    name: context.sourceName,
    start: timecodeForFileName(context.start),
    end: timecodeForFileName(context.end),
  }
  const filled = FILE_NAME_TEMPLATE.replace(/\{(\w+)\}/g, (match, token: string) => tokens[token] ?? match)
  return `${sanitizeFileName(filled) || 'clip'}.${context.extension}`
}
