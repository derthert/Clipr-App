// Small browser file helpers: naming, sizes and downloads.

export const VIDEO_ACCEPT = 'video/*,.mkv,.mov,.avi,.webm,.m4v,.ts,.flv,.wmv'

export function baseName(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

export function downloadBlobUrl(url: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
}

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true
  return ['mkv', 'mov', 'avi', 'webm', 'm4v', 'ts', 'flv', 'wmv', 'mp4'].includes(
    extensionOf(file.name),
  )
}
