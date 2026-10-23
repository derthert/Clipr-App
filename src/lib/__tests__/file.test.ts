import { describe, it, expect } from 'vitest'
import { formatBytes } from '../file'

describe('formatBytes', () => {
  it('handles falsy values and 0 correctly', () => {
    expect(formatBytes(0)).toBe('0 B')
    // @ts-expect-error testing invalid input just in case
    expect(formatBytes(undefined)).toBe('0 B')
    // @ts-expect-error testing invalid input just in case
    expect(formatBytes(null)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    // 1-9 B should be 0 decimals
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(5)).toBe('5 B')
    expect(formatBytes(9)).toBe('9 B')

    // Bytes scale is always integer mathematically by the rounding if index === 0
    expect(formatBytes(10)).toBe('10 B')
    expect(formatBytes(100)).toBe('100 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes correctly', () => {
    // 1024 B = 1 KB
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1.5)).toBe('1.5 KB')

    // >= 10 KB uses 0 decimals
    expect(formatBytes(1024 * 9.9)).toBe('9.9 KB')
    expect(formatBytes(1024 * 10)).toBe('10 KB')
    expect(formatBytes(1024 * 15)).toBe('15 KB')
    expect(formatBytes(1024 * 500.5)).toBe('501 KB')
    expect(formatBytes(1024 * 1023)).toBe('1023 KB')
  })

  it('formats megabytes correctly', () => {
    // 1024 * 1024 B = 1 MB
    const MB = 1024 * 1024
    expect(formatBytes(MB)).toBe('1.0 MB')
    expect(formatBytes(MB * 5.25)).toBe('5.3 MB') // 5.25 rounded to 1 decimal

    // >= 10 MB uses 0 decimals
    expect(formatBytes(MB * 10)).toBe('10 MB')
    expect(formatBytes(MB * 10.5)).toBe('11 MB') // 10.5 rounded to 0 decimals
    expect(formatBytes(MB * 500)).toBe('500 MB')
  })

  it('formats gigabytes correctly', () => {
    // 1024 * 1024 * 1024 B = 1 GB
    const GB = 1024 * 1024 * 1024
    expect(formatBytes(GB)).toBe('1.0 GB')
    expect(formatBytes(GB * 2.7)).toBe('2.7 GB')

    // >= 10 GB uses 0 decimals
    expect(formatBytes(GB * 15.5)).toBe('16 GB')
    expect(formatBytes(GB * 150)).toBe('150 GB')
  })

  it('maxes out at GB scale for larger values', () => {
    const TB = 1024 * 1024 * 1024 * 1024
    expect(formatBytes(TB)).toBe('1024 GB')
    expect(formatBytes(TB * 1.5)).toBe('1536 GB')
    expect(formatBytes(TB * 10)).toBe('10240 GB')
  })
})
