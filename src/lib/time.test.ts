import { describe, it, expect } from 'vitest'
import { clamp } from './time'

describe('clamp', () => {
  it('returns the value when it is within the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns the minimum when the value is below the minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('returns the maximum when the value is above the maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  it('returns the value when it is exactly at the minimum boundary', () => {
    expect(clamp(0, 0, 10)).toBe(0)
  })

  it('returns the value when it is exactly at the maximum boundary', () => {
    expect(clamp(10, 0, 10)).toBe(10)
  })
})
