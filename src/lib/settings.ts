// Export settings, their presets and the ffmpeg argument list they produce.

import type { ExportSettings, Preferences, QualityPreset, ScalePreset } from '../types'
import { timecodeForFileName } from './time'
import { sanitizeFileName } from './file'

export const MIN_CLIP_DURATION = 0.05
export const FILE_NAME_TEMPLATE = '{name}_{start}-{end}'
export const AUDIO_BITRATE = '160k'

export const DEFAULT_SETTINGS: ExportSettings = {
  mode: 'precise',
  format: 'mp4',
  quality: 'balanced',
  scale: 'source',
  muteAudio: false,
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  loopSelection: true,
}

const QUALITY: Record<QualityPreset, { crf: string; preset: string }> = {
  high: { crf: '19', preset: 'veryfast' },
  balanced: { crf: '24', preset: 'veryfast' },
  small: { crf: '30', preset: 'veryfast' },
}

const SCALE_HEIGHTS: Record<Exclude<ScalePreset, 'source'>, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
}

const COPY_SAFE_CONTAINERS = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'avi', 'flv'])

export function outputExtension(settings: ExportSettings, sourceExtension: string): string {
  if (settings.mode === 'copy') {
    return COPY_SAFE_CONTAINERS.has(sourceExtension) ? sourceExtension : 'mp4'
  }
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
  if (settings.scale !== 'source') {
    const target = SCALE_HEIGHTS[settings.scale]
    const height = sourceHeight ? Math.min(sourceHeight, target) : target
    filters.push(`scale=-2:${Math.round(height / 2) * 2}:flags=lanczos`)
  }
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
  const args = ['-hide_banner', '-ss', start.toFixed(3), '-i', input, '-t', duration.toFixed(3)]
  const wantsAudio = !settings.muteAudio && settings.format !== 'gif'
  const filters = videoFilters(settings, sourceHeight)

  if (settings.mode === 'copy') {
    args.push('-map', '0:v:0?')
    if (wantsAudio) args.push('-map', '0:a:0?')
    args.push('-c', 'copy', output)
    return args
  }

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
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    QUALITY[settings.quality].preset,
    '-crf',
    QUALITY[settings.quality].crf,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
  )
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
