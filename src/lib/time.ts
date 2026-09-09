// Timecode parsing and formatting used by the timeline, the inputs and file names.

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const pad = (value: number, size = 2) => String(value).padStart(size, '0')

export function formatTimecode(seconds: number, withMillis = true): string {
  const total = Math.max(0, Math.round(seconds * 1000))
  const millis = total % 1000
  const totalSeconds = Math.floor(total / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const head = hours > 0 ? `${hours}:${pad(minutes)}` : pad(minutes)
  const base = `${head}:${pad(secs)}`
  return withMillis ? `${base}.${pad(millis, 3)}` : base
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`
  return formatTimecode(seconds, false)
}

export function parseTimecode(input: string): number | null {
  const text = input.trim().replace(',', '.')
  if (!text) return null
  const parts = text.split(':')
  if (parts.length > 3) return null
  let seconds = 0
  for (const part of parts) {
    if (!/^\d*\.?\d*$/.test(part) || part === '' || part === '.') return null
    seconds = seconds * 60 + Number(part)
  }
  return Number.isFinite(seconds) ? seconds : null
}

export function timecodeForFileName(seconds: number): string {
  return formatTimecode(seconds).replace(/[:.]/g, '-')
}
