// Shared vocabulary for the editor, the export pipeline and the queue.

export type TrimMode = 'copy' | 'precise'
export type ExportFormat = 'mp4' | 'gif' | 'mp3'
export type QualityPreset = 'high' | 'balanced' | 'small'
export type ScalePreset = 'source' | '1080' | '720' | '480'
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'canceled'

export interface ExportSettings {
  mode: TrimMode
  format: ExportFormat
  quality: QualityPreset
  scale: ScalePreset
  muteAudio: boolean
}

export interface Preferences {
  theme: 'dark' | 'light'
  loopSelection: boolean
}

export interface VideoSource {
  file: File
  url: string
  path?: string
  name: string
  extension: string
  size: number
  duration: number
  width: number
  height: number
}

export interface Selection {
  start: number
  end: number
}

export interface ExportJob {
  id: string
  fileName: string
  sourceName: string
  file: File
  sourcePath?: string
  sourceHeight: number
  extension: string
  start: number
  end: number
  settings: ExportSettings
  status: JobStatus
  progress: number
  url?: string
  path?: string
  size?: number
  error?: string
}
