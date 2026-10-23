import { describe, it, expect } from 'vitest'
import { isVideoFile } from './file'

describe('isVideoFile', () => {
  it('returns true for files with video/ mime types', () => {
    expect(isVideoFile({ type: 'video/mp4', name: 'video.mp4' } as File)).toBe(true)
    expect(isVideoFile({ type: 'video/webm', name: 'video.webm' } as File)).toBe(true)
    expect(isVideoFile({ type: 'video/x-matroska', name: 'video.mkv' } as File)).toBe(true)
  })

  it('returns true for known video extensions regardless of mime type', () => {
    // Empty mime type (e.g. some file systems or unknown formats)
    expect(isVideoFile({ type: '', name: 'video.mkv' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'movie.MOV' } as File)).toBe(true)

    // Some other common extensions
    expect(isVideoFile({ type: 'application/octet-stream', name: 'clip.avi' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.webm' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.m4v' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.ts' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.flv' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.wmv' } as File)).toBe(true)
    expect(isVideoFile({ type: '', name: 'test.mp4' } as File)).toBe(true)
  })

  it('returns false for non-video files', () => {
    expect(isVideoFile({ type: 'image/png', name: 'image.png' } as File)).toBe(false)
    expect(isVideoFile({ type: 'application/pdf', name: 'document.pdf' } as File)).toBe(false)
    expect(isVideoFile({ type: '', name: 'archive.zip' } as File)).toBe(false)
    expect(isVideoFile({ type: 'audio/mp3', name: 'audio.mp3' } as File)).toBe(false)
  })

  it('handles edge cases', () => {
    // Files with no extension
    expect(isVideoFile({ type: '', name: 'video' } as File)).toBe(false)

    // Complex names
    expect(isVideoFile({ type: '', name: 'my.cool.video.mp4' } as File)).toBe(true)

    // Hidden files (dot at index 0 means no extension)
    expect(isVideoFile({ type: '', name: '.mp4' } as File)).toBe(false)
  })
})
