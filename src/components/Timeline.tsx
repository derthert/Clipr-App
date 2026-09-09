// The scrub bar: filmstrip background, draggable in/out handles and a playhead.

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Selection } from '../types'
import { clamp, formatTimecode } from '../lib/time'
import { MIN_CLIP_DURATION } from '../lib/settings'

type DragMode = 'in' | 'out' | 'move' | 'scrub'

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]

interface TimelineProps {
  duration: number
  selection: Selection
  time: number
  frames: (string | undefined)[]
  onChange: (selection: Selection) => void
  onSeek: (time: number) => void
}

export function Timeline({ duration, selection, time, frames, onChange, onSeek }: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: DragMode; grabbedAt: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)

  const percent = (value: number) => `${clamp((value / duration) * 100, 0, 100)}%`

  const ticks = useMemo(() => {
    const step = TICK_STEPS.find((candidate) => duration / candidate <= 8) ?? 3600
    const result: number[] = []
    for (let value = 0; value <= duration - step * 0.4; value += step) result.push(value)
    return result
  }, [duration])

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return clamp((clientX - rect.left) / rect.width, 0, 1) * duration
  }

  const applyDrag = (at: number) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'in') {
      const start = clamp(at, 0, selection.end - MIN_CLIP_DURATION)
      onChange({ start, end: selection.end })
      onSeek(start)
    } else if (drag.mode === 'out') {
      const end = clamp(at, selection.start + MIN_CLIP_DURATION, duration)
      onChange({ start: selection.start, end })
      onSeek(end)
    } else if (drag.mode === 'move') {
      const width = selection.end - selection.start
      const start = clamp(at - drag.grabbedAt, 0, duration - width)
      onChange({ start, end: start + width })
    } else {
      onSeek(at)
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const role = (event.target as HTMLElement).dataset.role as DragMode | undefined
    const at = timeAt(event.clientX)
    const mode: DragMode = event.shiftKey ? 'move' : (role ?? 'scrub')
    dragRef.current = { mode, grabbedAt: at - selection.start }
    trackRef.current?.setPointerCapture(event.pointerId)
    applyDrag(at)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const at = timeAt(event.clientX)
    setHover(at)
    setMoving(event.shiftKey)
    applyDrag(at)
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    trackRef.current?.releasePointerCapture(event.pointerId)
  }

  const nudge = (edge: 'in' | 'out', event: ReactKeyboardEvent) => {
    const step = event.shiftKey ? 1 : event.altKey ? 0.04 : 0.1
    const direction = event.key === 'ArrowRight' ? 1 : -1
    if (edge === 'in') {
      const start = clamp(selection.start + step * direction, 0, selection.end - MIN_CLIP_DURATION)
      onChange({ start, end: selection.end })
      onSeek(start)
    } else {
      const end = clamp(selection.end + step * direction, selection.start + MIN_CLIP_DURATION, duration)
      onChange({ start: selection.start, end })
      onSeek(end)
    }
  }

  const onHandleKeyDown = (edge: 'in' | 'out') => (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      event.stopPropagation()
      nudge(edge, event)
    }
  }

  return (
    <div className="timeline">
      <div
        className="timeline__track"
        ref={trackRef}
        data-moving={moving}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          setHover(null)
          setMoving(false)
        }}
      >
        <div className="timeline__frames" aria-hidden="true">
          {frames.map((frame, index) => (
            <div
              key={index}
              className="timeline__frame"
              style={frame ? { backgroundImage: `url(${frame})` } : undefined}
            />
          ))}
        </div>

        <div className="timeline__shade" style={{ left: 0, width: percent(selection.start) }} />
        <div
          className="timeline__shade"
          style={{ left: percent(selection.end), width: percent(duration - selection.end) }}
        />

        <div
          className="timeline__selection"
          style={{
            left: percent(selection.start),
            width: percent(selection.end - selection.start),
          }}
        >
          <span
            className="timeline__handle timeline__handle--in"
            data-role="in"
            role="slider"
            tabIndex={0}
            aria-label="Clip start"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Number(selection.start.toFixed(2))}
            aria-valuetext={formatTimecode(selection.start)}
            onKeyDown={onHandleKeyDown('in')}
          />
          <span
            className="timeline__handle timeline__handle--out"
            data-role="out"
            role="slider"
            tabIndex={0}
            aria-label="Clip end"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={Number(selection.end.toFixed(2))}
            aria-valuetext={formatTimecode(selection.end)}
            onKeyDown={onHandleKeyDown('out')}
          />
        </div>

        <div className="timeline__playhead" style={{ left: percent(time) }} />

        {hover !== null && !dragRef.current ? (
          <div className="timeline__hover" style={{ left: percent(hover) }}>
            <span>{formatTimecode(hover, false)}</span>
          </div>
        ) : null}
      </div>

      <div className="timeline__ruler" aria-hidden="true">
        {ticks.map((tick) => (
          <span key={tick} className="timeline__tick" style={{ left: percent(tick) }}>
            {formatTimecode(tick, false)}
          </span>
        ))}
      </div>
    </div>
  )
}
