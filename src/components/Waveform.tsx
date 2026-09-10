// Draws the audio peaks as mirrored bars, redrawing on resize and theme changes.

import { useEffect, useRef } from 'react'

interface WaveformProps {
  peaks: Float32Array | null
}

export function Waveform({ peaks }: WaveformProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return

    const draw = () => {
      const scale = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)

      const context = canvas.getContext('2d')
      if (!context) return
      context.scale(scale, scale)
      context.fillStyle = getComputedStyle(canvas).color
      const middle = height / 2

      if (!peaks) {
        context.globalAlpha = 0.35
        context.fillRect(0, middle - 0.5, width, 1)
        return
      }

      const slot = width / peaks.length
      const bar = Math.max(1, slot * 0.6)
      const reach = (height - 6) / 2
      for (let index = 0; index < peaks.length; index += 1) {
        const half = Math.max(0.5, peaks[index] * reach)
        context.fillRect(index * slot, middle - half, bar, half * 2)
      }
    }

    draw()
    const sizes = new ResizeObserver(draw)
    sizes.observe(canvas)
    const theme = new MutationObserver(draw)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      sizes.disconnect()
      theme.disconnect()
    }
  }, [peaks])

  return <canvas ref={ref} className="waveform" aria-hidden="true" />
}
