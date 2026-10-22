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
  id: string
  file: File
  url: string
  path?: string
  name: string
  extension: string
  size: number
  duration: number
  width: number
  height: number
  filmstrip?: string[]
}

export interface VideoItem {
  id: string
  source: VideoSource
  selection: Selection
}

/**
 * A trimmed piece of a source video placed on the unified timeline.
 * Timeline position is *computed* from the array order — there are no gaps.
 */
export interface Segment {
  id: string
  sourceId: string
  sourceStart: number // seconds within the source video
  sourceEnd: number   // seconds within the source video
  trimStart?: number  // start trim point in seconds
  trimEnd?: number    // end trim point in seconds
  timelineOffset?: number // start position on the timeline, in seconds
}

/** Segment with its computed timeline position. */
export interface SegmentView extends Segment {
  trimStart: number
  trimEnd: number
  timelineStart: number
  timelineDuration: number
}

export interface Selection {
  start: number
  end: number
}

/** Independent text clip placed on the dedicated Text Track above the video track. */
export interface TextSegment {
  id: string
  text: string
  fontFamily: string
  fontSize: number
  color: string
  x: number // Horizontal center position on the video canvas (0..100%)
  y: number // Vertical center position on the video canvas (0..100%)
  timelineStart: number
  duration: number
}

export type CompositionPiece =
  | {
      kind: 'gap'
      duration: number
    }
  | {
      kind: 'clip'
      file: File
      sourcePath?: string
      sourceStart: number
      sourceEnd: number
      duration: number
      width: number
      height: number
    }

export interface ExportJob {
  id: string
  fileName: string
  sourceName: string
  file: File
  sourcePath?: string
  sourceWidth?: number
  sourceHeight: number
  extension: string
  start: number
  end: number
  pieces?: CompositionPiece[]
  textSegments?: TextSegment[]
  settings: ExportSettings
  status: JobStatus
  progress: number
  url?: string
  path?: string
  size?: number
  error?: string
}
