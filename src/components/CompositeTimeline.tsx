// The unified timeline: supports an independent Text Track layer above the Video Track,
// playhead scrubbing, clip & text selection, non-scaling segment trimming (left/right handles),
// dragging a clip from its middle to change its timeline start position,
// and magnetic edge/playhead snapping with overlap prevention. It zooms (Ctrl + wheel, the
// zoom bar, or +/-) by widening the tracks inside a horizontally scrolling viewport.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { SegmentView, Selection, TextSegment, VideoSource } from '../types'
import { useHotkeys } from '../hooks/useHotkeys'
import { clamp, formatTimecode } from '../lib/time'
import { IconMinus, IconPlus } from './icons'

const MIN_SEG_DUR = 0.04
const SNAP_THRESHOLD_PX = 12

const MIN_ZOOM = 1
const ZOOM_STEP = 1.5
// Deepest zoom: this many pixels per second of video.
const MAX_PX_PER_SECOND = 400
// Dragging this close to the viewport edge scrolls the timeline along.
const EDGE_SCROLL_PX = 32

// One color per distinct source video
const PALETTE = [
  '#7c5cff', // purple  (brand)
  '#2dd4bf', // teal
  '#f97316', // orange
  '#22c55e', // green
  '#eab308', // amber
  '#ec4899', // pink
  '#38bdf8', // sky
  '#a78bfa', // violet
]

const TICK_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]
type DragState =
  | { kind: 'scrub' }
  | { kind: 'sel'; anchor: number }
  | {
      kind: 'trim'
      segId: string
      edge: 'start' | 'end'
      initView: SegmentView
      others: SegmentView[]
      maxDur: number
      grabTime: number
      historySaved: boolean
      snapTargets: number[]
    }
  | {
      kind: 'move'
      segId: string
      initView: SegmentView
      others: SegmentView[]
      grabOffset: number
      initClientX: number
      moved: boolean
      historySaved: boolean
      snapTargets: number[]
    }
  | {
      kind: 'trim-text'
      textId: string
      edge: 'start' | 'end'
      initSeg: TextSegment
      grabTime: number
    }
  | {
      kind: 'move-text'
      textId: string
      initSeg: TextSegment
      grabOffset: number
      initClientX: number
      moved: boolean
      snapTargets: number[]
    }

interface CompositeTimelineProps {
  views: SegmentView[]
  textSegments: TextSegment[]
  hasTextTrack: boolean
  sources: Map<string, VideoSource>
  totalDuration: number
  time: number
  selectedClipId: string | null
  selectedTextId: string | null
  selection: Selection | null
  onSeek: (t: number) => void
  onSelectClip: (segId: string | null) => void
  onSelectText: (textId: string | null) => void
  onSelectionChange: (sel: Selection | null) => void
  onTrimSegment: (
    segId: string,
    edge: 'start' | 'end',
    newSrcTime: number,
    maxDur: number,
    newTimelineOffset?: number,
  ) => void
  onMoveSegment: (segId: string, timelineOffset: number) => void
  onUpdateText: (textId: string, patch: Partial<TextSegment>) => void
  onSaveHistory?: () => void
  onSplitAt: (t: number) => void
  onRemoveSegment: (segId: string) => void
}

function sourceIndex(sourceId: string, sources: Map<string, VideoSource>): number {
  let i = 0
  for (const key of sources.keys()) {
    if (key === sourceId) return i
    i++
  }
  return 0
}

export function CompositeTimeline({
  views,
  textSegments,
  hasTextTrack,
  sources,
  totalDuration,
  time,
  selectedClipId,
  selectedTextId,
  selection,
  onSeek,
  onSelectClip,
  onSelectText,
  onSelectionChange,
  onTrimSegment,
  onMoveSegment,
  onUpdateText,
  onSaveHistory,
}: CompositeTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [hovering, setHovering] = useState<number | null>(null)
  const [activeDragKind, setActiveDragKind] = useState<DragState['kind'] | null>(null)
  const [snapLineTime, setSnapLineTime] = useState<number | null>(null)
  const [lockedSpan, setLockedSpan] = useState<number | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [viewportWidth, setViewportWidth] = useState(0)
  // Time and on-screen offset that must stay put across the next zoom change.
  const zoomAnchorRef = useRef<{ time: number; offsetX: number } | null>(null)

  const sourcesDuration = useMemo(
    () => Array.from(sources.values()).reduce((sum, src) => sum + src.duration, 0),
    [sources],
  )

  const textEndDuration = useMemo(
    () => textSegments.reduce((end, seg) => Math.max(end, seg.timelineStart + seg.duration), 0),
    [textSegments],
  )

  // Visual track capacity: includes trailing workspace so clips can be dragged right to create gaps,
  // and stays locked during pointer drag so the timeline never rescales under the cursor.
  const baseSpan = useMemo(() => {
    const refDur = Math.max(sourcesDuration, totalDuration, textEndDuration)
    return refDur > 0 ? Math.max(refDur * 1.15, totalDuration + Math.max(2, refDur * 0.1)) : 0
  }, [sourcesDuration, totalDuration, textEndDuration])

  const displaySpan = lockedSpan ?? baseSpan

  const pct = (t: number): string =>
    `${clamp(displaySpan > 0 ? (t / displaySpan) * 100 : 0, 0, 100)}%`

  const maxZoom =
    viewportWidth > 0 && displaySpan > 0
      ? Math.max(MIN_ZOOM, (displaySpan * MAX_PX_PER_SECOND) / viewportWidth)
      : MIN_ZOOM

  // About ten labels across the visible part, whatever the zoom.
  const tickStep = useMemo(() => {
    const visibleSpan = displaySpan / zoom
    return TICK_STEPS.find((s) => visibleSpan / s <= 10) ?? 3600
  }, [displaySpan, zoom])

  const ticks = useMemo(() => {
    if (displaySpan === 0) return []
    const result: number[] = []
    for (let i = 0; i * tickStep <= displaySpan - tickStep * 0.4; i++) result.push(i * tickStep)
    return result
  }, [displaySpan, tickStep])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => setViewportWidth(viewport.clientWidth))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  /** Zooms while keeping the time under `anchorClientX` (default: the playhead) in place. */
  const zoomTo = (next: number, anchorClientX?: number) => {
    const viewport = viewportRef.current
    const target = clamp(next, MIN_ZOOM, maxZoom)
    if (target === zoom) return
    if (viewport && displaySpan > 0) {
      const rect = viewport.getBoundingClientRect()
      const playheadX = (time / displaySpan) * viewport.scrollWidth - viewport.scrollLeft
      const offsetX = clamp(
        anchorClientX !== undefined ? anchorClientX - rect.left : playheadX,
        0,
        rect.width,
      )
      zoomAnchorRef.current = {
        time: ((viewport.scrollLeft + offsetX) / viewport.scrollWidth) * displaySpan,
        offsetX,
      }
    }
    setZoom(target)
  }

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current
    const viewport = viewportRef.current
    zoomAnchorRef.current = null
    if (!anchor || !viewport || displaySpan === 0) return
    viewport.scrollLeft = (anchor.time / displaySpan) * viewport.scrollWidth - anchor.offsetX
  }, [zoom, displaySpan])

  // Wheel: Ctrl/Cmd + wheel (and trackpad pinch) zooms around the cursor; a plain vertical
  // wheel pans sideways once zoomed in. Needs a non-passive listener to stop page zoom.
  const zoomToRef = useRef(zoomTo)
  zoomToRef.current = zoomTo
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomToRef.current(zoomRef.current * Math.exp(-event.deltaY * 0.0025), event.clientX)
      } else if (zoomRef.current > MIN_ZOOM && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault()
        viewport.scrollLeft += event.deltaY
      }
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [])

  // Keep the playhead on screen while it moves (playback, arrow keys). Only reacts to
  // `time`, so scrolling away by hand while paused is left alone.
  const spanRef = useRef(displaySpan)
  spanRef.current = displaySpan
  useEffect(() => {
    const viewport = viewportRef.current
    const span = spanRef.current
    if (!viewport || zoomRef.current <= MIN_ZOOM || dragRef.current || span === 0) return
    const x = (time / span) * viewport.scrollWidth
    const margin = viewport.clientWidth * 0.05
    if (x < viewport.scrollLeft + margin || x > viewport.scrollLeft + viewport.clientWidth - margin) {
      viewport.scrollLeft = x - viewport.clientWidth * 0.2
    }
  }, [time])

  useHotkeys({
    '=': () => zoomTo(zoom * ZOOM_STEP),
    '+': () => zoomTo(zoom * ZOOM_STEP),
    'shift++': () => zoomTo(zoom * ZOOM_STEP),
    '-': () => zoomTo(zoom / ZOOM_STEP),
    '0': () => zoomTo(MIN_ZOOM),
  })

  const timeAt = (clientX: number, spanOverride?: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    const span = spanOverride ?? displaySpan
    if (!rect || rect.width === 0 || span === 0) return 0
    return clamp((clientX - rect.left) / rect.width, 0, 1) * span
  }

  const getSnapThresholdSec = (span: number): number => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || span === 0) return 0
    return (SNAP_THRESHOLD_PX / rect.width) * span
  }

  // ── Pointer interaction ────────────────────────────────────────────────────

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    // The zoom bar and the viewport's own scrollbar are not part of the timeline surface.
    if (e.target === viewportRef.current) return
    if ((e.target as HTMLElement).closest('.ctimeline__zoom')) return
    containerRef.current?.setPointerCapture(e.pointerId)

    const currentSpan = displaySpan
    setLockedSpan(currentSpan)

    const targetEl = (e.target as HTMLElement).closest<HTMLElement>('[data-role]')
    const role = targetEl?.dataset.role
    const segId = targetEl?.dataset.segId
    const textId = targetEl?.dataset.textId
    const t = timeAt(e.clientX, currentSpan)

    // Shift+click jumps the playhead anywhere, even over a clip or text clip, without
    // changing what is selected. Dragging further turns it into a range selection.
    if (e.shiftKey) {
      const at = clamp(t, 0, currentSpan)
      dragRef.current = { kind: 'sel', anchor: at }
      setActiveDragKind('sel')
      onSeek(at)
      return
    }

    if (role === 'playhead' || role === 'ruler') {
      dragRef.current = { kind: 'scrub' }
      setActiveDragKind('scrub')
      onSeek(clamp(t, 0, currentSpan))
    } else if (role === 'trim-text-start' && textId) {
      const seg = textSegments.find((x) => x.id === textId)
      onSelectText(textId)
      onSelectClip(null)
      onSelectionChange(null)
      if (seg) {
        dragRef.current = {
          kind: 'trim-text',
          textId,
          edge: 'start',
          initSeg: seg,
          grabTime: t,
        }
        setActiveDragKind('trim-text')
      }
    } else if (role === 'trim-text-end' && textId) {
      const seg = textSegments.find((x) => x.id === textId)
      onSelectText(textId)
      onSelectClip(null)
      onSelectionChange(null)
      if (seg) {
        dragRef.current = {
          kind: 'trim-text',
          textId,
          edge: 'end',
          initSeg: seg,
          grabTime: t,
        }
        setActiveDragKind('trim-text')
      }
    } else if (role === 'text-segment' && textId) {
      const seg = textSegments.find((x) => x.id === textId)
      onSelectText(textId)
      onSelectClip(null)
      onSelectionChange(null)
      if (seg) {
        dragRef.current = {
          kind: 'move-text',
          textId,
          initSeg: seg,
          grabOffset: t - seg.timelineStart,
          initClientX: e.clientX,
          moved: false,
          snapTargets: [
            0,
            time,
            ...views.flatMap((v) => [v.timelineStart, v.timelineStart + v.timelineDuration]),
            ...textSegments
              .filter((ts) => ts.id !== textId)
              .flatMap((ts) => [ts.timelineStart, ts.timelineStart + ts.duration]),
          ]
        }
        setActiveDragKind('move-text')
      }
    } else if (role === 'trim-start' && segId) {
      const v = views.find((x) => x.id === segId)
      const src = v ? sources.get(v.sourceId) : undefined
      onSelectClip(segId)
      onSelectText(null)
      onSelectionChange(null)
      if (v && src) {
        const others = views
          .filter((view) => view.id !== segId)
          .sort((a, b) => a.timelineStart - b.timelineStart)

        dragRef.current = {
          kind: 'trim',
          segId,
          edge: 'start',
          initView: v,
          others,
          maxDur: src.duration,
          grabTime: t,
          historySaved: false,
          snapTargets: [
            0,
            time,
            ...views
              .filter((o) => o.id !== segId)
              .flatMap((o) => [o.timelineStart, o.timelineStart + o.timelineDuration]),
          ]
        }
        setActiveDragKind('trim')
      }
    } else if (role === 'trim-end' && segId) {
      const v = views.find((x) => x.id === segId)
      const src = v ? sources.get(v.sourceId) : undefined
      onSelectClip(segId)
      onSelectText(null)
      onSelectionChange(null)
      if (v && src) {
        const others = views
          .filter((view) => view.id !== segId)
          .sort((a, b) => a.timelineStart - b.timelineStart)

        dragRef.current = {
          kind: 'trim',
          segId,
          edge: 'end',
          initView: v,
          others,
          maxDur: src.duration,
          grabTime: t,
          historySaved: false,
          snapTargets: [
            0,
            time,
            ...views
              .filter((o) => o.id !== segId)
              .flatMap((o) => [o.timelineStart, o.timelineStart + o.timelineDuration]),
          ]
        }
        setActiveDragKind('trim')
      }
    } else if (role === 'segment' && segId) {
      const view = views.find((item) => item.id === segId)
      onSelectClip(segId)
      onSelectText(null)
      onSelectionChange(null)
      if (view) {
        const others = views
          .filter((v) => v.id !== segId)
          .sort((a, b) => a.timelineStart - b.timelineStart)

        dragRef.current = {
          kind: 'move',
          segId,
          initView: view,
          others,
          grabOffset: t - view.timelineStart,
          initClientX: e.clientX,
          moved: false,
          historySaved: false,
          snapTargets: [
            0,
            time,
            ...views
              .filter((o) => o.id !== segId)
              .flatMap((o) => [o.timelineStart, o.timelineStart + o.timelineDuration]),
          ]
        }
        setActiveDragKind('move')
      }
    } else {
      // Clicked on empty timeline space -> clear selected clip & text, scrub playhead
      onSelectClip(null)
      onSelectText(null)
      onSelectionChange(null)
      dragRef.current = { kind: 'scrub' }
      setActiveDragKind('scrub')
      onSeek(clamp(t, 0, currentSpan))
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (dragRef.current && viewport && zoom > MIN_ZOOM) {
      const rect = viewport.getBoundingClientRect()
      if (e.clientX < rect.left + EDGE_SCROLL_PX) {
        viewport.scrollLeft -= rect.left + EDGE_SCROLL_PX - e.clientX
      } else if (e.clientX > rect.right - EDGE_SCROLL_PX) {
        viewport.scrollLeft += e.clientX - (rect.right - EDGE_SCROLL_PX)
      }
    }
    const t = timeAt(e.clientX)
    setHovering(t)
    const drag = dragRef.current
    if (!drag) return

    const snapThreshold = getSnapThresholdSec(displaySpan)

    if (drag.kind === 'scrub') {
      onSeek(clamp(t, 0, displaySpan))
    } else if (drag.kind === 'sel') {
      const clampedT = clamp(t, 0, displaySpan)
      const start = Math.min(drag.anchor, clampedT)
      const end = Math.max(drag.anchor, clampedT)
      if (end - start > 0.02) {
        onSelectClip(null)
        onSelectText(null)
        onSelectionChange({ start, end })
        onSeek(clampedT)
      }
    } else if (drag.kind === 'trim-text') {
      const { textId, edge, initSeg, grabTime } = drag
      const delta = t - grabTime
      const initEnd = initSeg.timelineStart + initSeg.duration
      if (edge === 'start') {
        const newStart = clamp(initSeg.timelineStart + delta, 0, initEnd - 0.2)
        const newDur = initEnd - newStart
        onUpdateText(textId, { timelineStart: newStart, duration: newDur })
      } else {
        const newDur = clamp(initSeg.duration + delta, 0.2, Math.max(0.2, displaySpan - initSeg.timelineStart))
        onUpdateText(textId, { duration: newDur })
      }
    } else if (drag.kind === 'move-text') {
      if (Math.abs(e.clientX - drag.initClientX) > 3) {
        drag.moved = true
      }
      if (drag.moved) {
        const dur = drag.initSeg.duration
        const maxStart = Math.max(0, displaySpan - dur)
        let nextStart = clamp(t - drag.grabOffset, 0, maxStart)
        let activeSnap: number | null = null

        const snapTargets = drag.snapTargets

        let bestDist = snapThreshold
        for (const target of snapTargets) {
          const dStart = Math.abs(nextStart - target)
          if (dStart <= bestDist) {
            bestDist = dStart
            nextStart = clamp(target, 0, maxStart)
            activeSnap = target
          }
          const dEnd = Math.abs(nextStart + dur - target)
          if (dEnd <= bestDist && target - dur >= 0) {
            bestDist = dEnd
            nextStart = clamp(target - dur, 0, maxStart)
            activeSnap = target
          }
        }

        setSnapLineTime(activeSnap)
        onUpdateText(drag.textId, { timelineStart: nextStart })
      }
    } else if (drag.kind === 'trim') {
      // Record undo history on the first actual change, not on a plain click.
      if (!drag.historySaved) {
        onSaveHistory?.()
        drag.historySaved = true
      }
      const { segId, edge, initView, others, maxDur, grabTime } = drag
      const delta = t - grabTime

      const snapTargets = drag.snapTargets

      if (edge === 'start') {
        // Prevent overlapping previous clip
        const prevClipEnd = others
          .filter((o) => o.timelineStart + o.timelineDuration <= initView.timelineStart + 0.005)
          .reduce((max, o) => Math.max(max, o.timelineStart + o.timelineDuration), 0)

        const minStartByTimeline = initView.sourceStart - (initView.timelineStart - prevClipEnd)
        const minStart = Math.max(0, minStartByTimeline)
        const maxStart = initView.sourceEnd - MIN_SEG_DUR

        let newSrcStart = clamp(initView.sourceStart + delta, minStart, maxStart)
        let newTimelineStart = initView.timelineStart + (newSrcStart - initView.sourceStart)
        let activeSnap: number | null = null

        // Snap the left edge to nearby targets
        let bestDist = snapThreshold
        for (const target of snapTargets) {
          const dist = Math.abs(newTimelineStart - target)
          if (dist <= bestDist) {
            const candidateSrcStart = initView.sourceStart + (target - initView.timelineStart)
            if (candidateSrcStart >= minStart - 1e-6 && candidateSrcStart <= maxStart + 1e-6) {
              bestDist = dist
              newSrcStart = clamp(candidateSrcStart, minStart, maxStart)
              newTimelineStart = initView.timelineStart + (newSrcStart - initView.sourceStart)
              activeSnap = target
            }
          }
        }

        setSnapLineTime(activeSnap)
        onTrimSegment(segId, 'start', newSrcStart, maxDur, newTimelineStart)
      } else {
        // Prevent overlapping next clip
        const nextClipStart = others
          .filter((o) => o.timelineStart >= initView.timelineStart + initView.timelineDuration - 0.005)
          .reduce((min, o) => Math.min(min, o.timelineStart), Infinity)

        const maxEndByNeighbor = initView.sourceStart + (nextClipStart - initView.timelineStart)
        const minEnd = initView.sourceStart + MIN_SEG_DUR
        const effectiveMaxEnd = Math.min(maxDur, maxEndByNeighbor)

        let newSrcEnd = clamp(initView.sourceEnd + delta, minEnd, effectiveMaxEnd)
        const rawTimelineEnd = initView.timelineStart + (newSrcEnd - initView.sourceStart)
        let activeSnap: number | null = null

        // Snap the right edge to nearby targets
        let bestDist = snapThreshold
        for (const target of snapTargets) {
          const dist = Math.abs(rawTimelineEnd - target)
          if (dist <= bestDist) {
            const candidateSrcEnd = initView.sourceStart + (target - initView.timelineStart)
            if (candidateSrcEnd >= minEnd - 1e-6 && candidateSrcEnd <= effectiveMaxEnd + 1e-6) {
              bestDist = dist
              newSrcEnd = clamp(candidateSrcEnd, minEnd, effectiveMaxEnd)
              activeSnap = target
            }
          }
        }

        setSnapLineTime(activeSnap)
        onTrimSegment(segId, 'end', newSrcEnd, maxDur, initView.timelineStart)
      }
    } else if (drag.kind === 'move') {
      if (Math.abs(e.clientX - drag.initClientX) > 3) {
        drag.moved = true
      }
      if (drag.moved) {
        if (!drag.historySaved) {
          onSaveHistory?.()
          drag.historySaved = true
        }
        const dur = drag.initView.timelineDuration
        const maxTrackStart = Math.max(0, displaySpan - dur)
        const rawStart = clamp(t - drag.grabOffset, 0, maxTrackStart)
        const others = drag.others

        // Build non-overlapping valid start intervals [min, max]
        const validIntervals: Array<{ min: number; max: number }> = []
        let cursor = 0
        for (const other of others) {
          const gapStart = cursor
          const gapEnd = other.timelineStart
          if (gapEnd - gapStart >= dur - 1e-5) {
            validIntervals.push({ min: gapStart, max: Math.max(gapStart, gapEnd - dur) })
          }
          cursor = Math.max(cursor, other.timelineStart + other.timelineDuration)
        }
        validIntervals.push({ min: cursor, max: Math.max(cursor, maxTrackStart) })

        // Project rawStart onto the nearest valid non-overlapping interval
        let resolvedStart = rawStart
        let bestIntervalDist = Infinity
        for (const iv of validIntervals) {
          const candidate = clamp(rawStart, iv.min, iv.max)
          const d = Math.abs(rawStart - candidate)
          if (d < bestIntervalDist) {
            bestIntervalDist = d
            resolvedStart = candidate
          }
        }

        const isStartValid = (s: number) =>
          validIntervals.some((iv) => s >= iv.min - 1e-5 && s <= iv.max + 1e-5)

        const snapTargets = drag.snapTargets

        let bestSnapDist = snapThreshold
        let snappedStart = resolvedStart
        let activeSnap: number | null = null

        for (const target of snapTargets) {
          // 1. Snap clip's start edge to target
          const distStart = Math.abs(resolvedStart - target)
          if (distStart <= bestSnapDist && isStartValid(target)) {
            bestSnapDist = distStart
            snappedStart = target
            activeSnap = target
          }
          // 2. Snap clip's end edge to target
          const candidateByEnd = target - dur
          const distEnd = Math.abs(resolvedStart + dur - target)
          if (distEnd <= bestSnapDist && candidateByEnd >= 0 && isStartValid(candidateByEnd)) {
            bestSnapDist = distEnd
            snappedStart = candidateByEnd
            activeSnap = target
          }
        }

        setSnapLineTime(activeSnap)
        onMoveSegment(drag.segId, snappedStart)
      }
    }
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId)
    }
    const drag = dragRef.current
    if (drag?.kind === 'sel') {
      if (!selection || selection.end - selection.start < 0.05) onSelectionChange(null)
    }
    dragRef.current = null
    setActiveDragKind(null)
    setSnapLineTime(null)
    setLockedSpan(null)
  }

  if (views.length === 0 && sources.size === 0) {
    return (
      <div className="ctimeline ctimeline--empty">
        <span>Drop videos or click &ldquo;Add videos&rdquo; to start</span>
      </div>
    )
  }

  const showTextTrack = hasTextTrack || textSegments.length > 0

  return (
    <div
      className="ctimeline"
      ref={containerRef}
      data-dragging={activeDragKind ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={() => setHovering(null)}
    >
      <div className="ctimeline__zoom">
        <span className="ctimeline__zoom-hint">Ctrl + scroll to zoom</span>
        <button
          type="button"
          className="iconbutton iconbutton--sm"
          onClick={() => zoomTo(zoom / ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          title="Zoom out (-)"
        >
          <IconMinus size={14} />
        </button>
        <input
          type="range"
          className="ctimeline__zoom-slider"
          min={0}
          max={1000}
          step={1}
          value={maxZoom > MIN_ZOOM ? Math.round((Math.log(zoom) / Math.log(maxZoom)) * 1000) : 0}
          onChange={(e) => zoomTo(Math.exp((Number(e.target.value) / 1000) * Math.log(maxZoom)))}
          disabled={maxZoom <= MIN_ZOOM}
          aria-label="Timeline zoom"
        />
        <button
          type="button"
          className="iconbutton iconbutton--sm"
          onClick={() => zoomTo(zoom * ZOOM_STEP)}
          disabled={zoom >= maxZoom}
          title="Zoom in (+)"
        >
          <IconPlus size={14} />
        </button>
        <button
          type="button"
          className="button button--ghost button--sm"
          onClick={() => zoomTo(MIN_ZOOM)}
          disabled={zoom <= MIN_ZOOM}
          title="Show the whole timeline (0)"
        >
          Fit
        </button>
      </div>

      <div className="ctimeline__viewport" ref={viewportRef}>
        <div className="ctimeline__canvas" style={{ width: `${zoom * 100}%` }}>
          <div className="ctimeline__tracks">
            {/* ── Independent Text Track Layer (above Video Track) ── */}
            {showTextTrack && (
              <div className="ctimeline__track ctimeline__track--text" aria-label="Text track">
                <span className="ctimeline__track-badge">T · Text Track</span>
                {textSegments.map((tSeg) => {
                  const isSelected = tSeg.id === selectedTextId
                  return (
                    <div
                      key={tSeg.id}
                      className={`ctimeline__text-seg${isSelected ? ' ctimeline__text-seg--selected' : ''}`}
                      style={{
                        left: pct(tSeg.timelineStart),
                        width: pct(tSeg.duration),
                      }}
                      data-role="text-segment"
                      data-text-id={tSeg.id}
                      data-selected={isSelected ? 'true' : undefined}
                    >
                      <span className="ctimeline__text-seg-label">T · {tSeg.text || 'Text'}</span>
                      <span
                        className="ctimeline__trim ctimeline__trim--start"
                        data-role="trim-text-start"
                        data-text-id={tSeg.id}
                        title="Trim text start"
                      />
                      <span
                        className="ctimeline__trim ctimeline__trim--end"
                        data-role="trim-text-end"
                        data-text-id={tSeg.id}
                        title="Trim text end"
                      />
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Video Track ── */}
            <div className="ctimeline__track" ref={trackRef}>
              {/* ── Segments ── */}
              {views.map((view) => {
                const idx = sourceIndex(view.sourceId, sources)
                const color = PALETTE[idx % PALETTE.length]
                const src = sources.get(view.sourceId)
                const srcDur = src?.duration || view.timelineDuration || 1
                const segDur = Math.max(0.001, view.timelineDuration)
                const filmstripWidthPct = (srcDur / segDur) * 100
                const filmstripLeftPct = -(view.sourceStart / segDur) * 100
                const isSelected = view.id === selectedClipId

                return (
                  <div
                    key={view.id}
                    className={`ctimeline__segment${isSelected ? ' ctimeline__segment--selected' : ''}`}
                    style={
                      {
                        '--c': color,
                        left: pct(view.timelineStart),
                        width: pct(view.timelineDuration),
                      } as CSSProperties
                    }
                    data-role="segment"
                    data-seg-id={view.id}
                    data-selected={isSelected ? 'true' : undefined}
                  >
                    <div
                      className="ctimeline__filmstrip"
                      aria-hidden="true"
                      style={{
                        width: `${filmstripWidthPct}%`,
                        left: `${filmstripLeftPct}%`,
                      }}
                    >
                      {(src?.filmstrip ?? []).map((frame, index) => (
                        <span key={`${view.id}-${index}`} style={{ backgroundImage: `url(${frame})` }} />
                      ))}
                    </div>
                    <span className="ctimeline__seg-label">{src?.name ?? '—'}</span>
                    {/* Trim handles */}
                    <span
                      className="ctimeline__trim ctimeline__trim--start"
                      data-role="trim-start"
                      data-seg-id={view.id}
                      title="Trim start"
                    />
                    <span
                      className="ctimeline__trim ctimeline__trim--end"
                      data-role="trim-end"
                      data-seg-id={view.id}
                      title="Trim end"
                    />
                  </div>
                )
              })}

              {/* ── Selection ── */}
              {selection && selection.end - selection.start > 0.01 && (
                <>
                  <div className="ctimeline__shade" style={{ left: 0, width: pct(selection.start) }} />
                  <div
                    className="ctimeline__shade"
                    style={{ left: pct(selection.end), right: 0, width: 'auto' }}
                  />
                  <div
                    className="ctimeline__sel-bar"
                    style={{ left: pct(selection.start), width: pct(selection.end - selection.start) }}
                  >
                    <span className="ctimeline__sel-label">
                      {formatTimecode(selection.end - selection.start, false)}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* ── Magnetic Snap Guide Line (spans across all tracks) ── */}
            {snapLineTime !== null && (
              <div className="ctimeline__snap-line" style={{ left: pct(snapLineTime) }} />
            )}

            {/* ── Playhead (spans across all tracks) ── */}
            <div
              className="ctimeline__playhead"
              style={{ left: pct(time) }}
              data-role="playhead"
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={Number(totalDuration.toFixed(2))}
              aria-valuenow={Number(time.toFixed(2))}
              aria-valuetext={formatTimecode(time)}
            />

            {/* ── Hover tooltip ── */}
            {hovering !== null && !dragRef.current && (
              <div className="ctimeline__hover" style={{ left: pct(hovering) }}>
                <span>{formatTimecode(hovering, false)}</span>
              </div>
            )}
          </div>

          {/* ── Ruler ── */}
          <div className="ctimeline__ruler" data-role="ruler" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className="ctimeline__tick" style={{ left: pct(tick) }}>
                {formatTimecode(tick, tickStep < 1)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
