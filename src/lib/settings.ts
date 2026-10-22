// Export settings, their presets and the ffmpeg argument list they produce.

import type { ExportSettings, Preferences, QualityPreset, ScalePreset } from '../types'
import { timecodeForFileName } from './time'
import { sanitizeFileName } from './file'

export const MIN_CLIP_DURATION = 0.05
export const FILE_NAME_TEMPLATE = '{name}_{start}-{end}'
export const AUDIO_BITRATE = '128k'
export const DEFAULT_FPS = '30'
export const THREAD_COUNT = String(
  typeof navigator !== 'undefined' && navigator.hardwareConcurrency
    ? Math.min(8, Math.max(4, navigator.hardwareConcurrency))
    : 4,
)

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
}

const QUALITY_CRF: Record<QualityPreset, string> = {
  high: '24',
  balanced: '28',
  small: '30',
}

const SCALE_HEIGHTS: Record<Exclude<ScalePreset, 'source'>, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
}

/** Reference preview height so text fontSize scales identically between preview and export. */
export const PREVIEW_REF_HEIGHT = 360

/** Output height cap for a scale preset: 'source' is capped at 1080p. */
export function maxOutputHeight(scale: ScalePreset): number {
  return scale === 'source' ? 1080 : SCALE_HEIGHTS[scale]
}

/**
 * H.264 encoder arguments shared by every video export path. CRF drives the rate
 * control; maxrate/bufsize only cap peaks (libx264 ignores -b:v once -crf is set).
 */
export function x264Args(quality: QualityPreset): string[] {
  return [
    '-r', DEFAULT_FPS,
    '-threads', THREAD_COUNT,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-crf', QUALITY_CRF[quality],
    '-maxrate', '2.5M',
    '-bufsize', '4M',
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

function videoFilters(settings: ExportSettings, sourceHeight?: number): string[] {
  const filters: string[] = []
  if (settings.format === 'gif') filters.push('fps=12')
  // Cap output resolution to max 1080p (or the selected 720p/480p preset)
  const maxTarget = maxOutputHeight(settings.scale)
  const height = sourceHeight ? Math.min(sourceHeight, maxTarget) : maxTarget
  const evenHeight = Math.max(2, Math.round(height / 2) * 2)
  filters.push(`scale=-2:${evenHeight}:flags=fast_bilinear`)
  return filters
}

export interface CommandInput {
  input: string
  output: string
  start: number
  end: number
  settings: ExportSettings
  sourceHeight?: number
}

export function buildFfmpegArgs({
  input,
  output,
  start,
  end,
  settings,
  sourceHeight,
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
  const filters = videoFilters(settings, sourceHeight)

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
  args.push(...x264Args(settings.quality), '-movflags', '+faststart')
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
