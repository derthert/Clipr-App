import { describe, it, expect } from 'vitest'
import { buildFileName, type FileNameContext } from './settings'

describe('buildFileName', () => {
  it('builds a standard file name correctly', () => {
    const context: FileNameContext = {
      sourceName: 'MyVideo',
      start: 10, // 00:10
      end: 20,   // 00:20
      extension: 'mp4',
    }
    const result = buildFileName(context)
    expect(result).toBe('MyVideo_00-10-000-00-20-000.mp4')
  })

  it('sanitizes the sourceName properly', () => {
    const context: FileNameContext = {
      sourceName: 'Invalid/File:Name?',
      start: 5,
      end: 15,
      extension: 'mp4',
    }
    const result = buildFileName(context)
    expect(result).toBe('Invalid-File-Name-_00-05-000-00-15-000.mp4')
  })

  it('handles zero start and end times', () => {
    const context: FileNameContext = {
      sourceName: 'Clip',
      start: 0,
      end: 0,
      extension: 'gif',
    }
    const result = buildFileName(context)
    expect(result).toBe('Clip_00-00-000-00-00-000.gif')
  })

  it('formats fractional seconds accurately', () => {
    const context: FileNameContext = {
      sourceName: 'FastAction',
      start: 1.234,
      end: 2.567,
      extension: 'webm',
    }
    const result = buildFileName(context)
    expect(result).toBe('FastAction_00-01-234-00-02-567.webm')
  })

  it('truncates very long sanitized filenames appropriately', () => {
    const longName = 'A'.repeat(200)
    const context: FileNameContext = {
      sourceName: longName,
      start: 0,
      end: 10,
      extension: 'mp4',
    }
    const result = buildFileName(context)
    // The implementation concatenates everything first, then passes the full string to sanitizeFileName,
    // which cuts the *entire filename* (including timecode but without extension) to 120 characters.
    // So the total is 120 + 4 (.mp4) = 124
    expect(result.length).toBeLessThanOrEqual(124)
    // the timecode got truncated out entirely because 'A'.repeat(200) was so long!
    expect(result).toMatch(/^A+\.mp4$/)
  })
})
