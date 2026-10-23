// Manages a unified timeline of source videos and segments.
// Sources: Map<id, VideoSource>
// Segments: array of clips, each placed at an explicit timelineOffset (gaps allowed).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Segment, SegmentView, TextSegment, VideoSource } from '../types'
import { desktop } from '../lib/desktop'
import { baseName, extensionOf, isVideoFile } from '../lib/file'
import { captureFilmstrip } from '../lib/filmstrip'
import { FILMSTRIP_FRAMES } from '../config'

const METADATA_TIMEOUT = 15000
const MIN_SEG = 0.04

function createId(): string {
  if (crypto.randomUUID) return crypto.randomUUID()
  const array = new Uint32Array(4)
  crypto.getRandomValues(array)
  const randomStr = Array.from(array, (n) => n.toString(16).padStart(8, '0')).join('')
  return `id-${Date.now()}-${randomStr}`
}

function probe(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const timer = window.setTimeout(
      () => finish(new Error('Reading this file timed out.')),
      METADATA_TIMEOUT,
    )
    const finish = (err?: Error) => {
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      if (err) reject(err)
    }
    video.addEventListener('error', () => finish(new Error('This file cannot be decoded.')))
    video.addEventListener(
      'loadedmetadata',
      () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          const { duration, videoWidth, videoHeight } = video
          finish()
          resolve({ duration, width: videoWidth, height: videoHeight })
          return
        }
        video.addEventListener(
          'durationchange',
          () => {
            if (!Number.isFinite(video.duration)) return
            const { duration, videoWidth, videoHeight } = video
            finish()
            resolve({ duration, width: videoWidth, height: videoHeight })
          },
          { once: true },
        )
        video.currentTime = 1e6
      },
      { once: true },
    )
    video.src = url
  })
}

export function computeViews(segments: Segment[]): SegmentView[] {
  let t = 0
  return segments.map((seg) => {
    const sourceStart = seg.trimStart ?? seg.sourceStart
    const sourceEnd = seg.trimEnd ?? seg.sourceEnd
    const dur = Math.max(0, sourceEnd - sourceStart)
    const timelineStart = seg.timelineOffset !== undefined ? Math.max(0, seg.timelineOffset) : t
    const view: SegmentView = {
      ...seg,
      sourceStart,
      sourceEnd,
      trimStart: sourceStart,
      trimEnd: sourceEnd,
      timelineStart,
      timelineDuration: dur,
    }
    t = timelineStart + dur
    return view
  })
}

/**
 * Slice a segment list by a [rangeStart, rangeEnd] window on the unified timeline.
 * `before` keeps its timeline positions, `after` is shifted left by the range length
 * (ripple), and `inside` holds the removed pieces. Every piece carries an explicit
 * `timelineOffset`, so nothing falls back to the "right after the previous segment" layout.
 */
function sliceByRange(
  views: SegmentView[],
  rangeStart: number,
  rangeEnd: number,
): { before: Segment[]; inside: Segment[]; after: Segment[] } {
  const before: Segment[] = []
  const inside: Segment[] = []
  const after: Segment[] = []
  const shift = rangeEnd - rangeStart

  for (const v of views) {
    const segEnd = v.timelineStart + v.timelineDuration
    if (segEnd <= rangeStart) { before.push(bare(v)); continue }
    if (v.timelineStart >= rangeEnd) {
      after.push(piece(v, v.sourceStart, v.sourceEnd, v.timelineStart - shift, v.id))
      continue
    }

    // Overlapping segment: split into up to 3 pieces
    if (v.timelineStart < rangeStart) {
      const end = v.sourceStart + (rangeStart - v.timelineStart)
      if (end - v.sourceStart >= MIN_SEG) before.push(piece(v, v.sourceStart, end, v.timelineStart))
    }
    const inStart = v.sourceStart + Math.max(0, rangeStart - v.timelineStart)
    const inEnd = v.sourceStart + Math.min(v.timelineDuration, rangeEnd - v.timelineStart)
    if (inEnd - inStart >= MIN_SEG)
      inside.push(piece(v, inStart, inEnd, Math.max(v.timelineStart, rangeStart)))
    if (segEnd > rangeEnd) {
      const start = v.sourceStart + (rangeEnd - v.timelineStart)
      if (v.sourceEnd - start >= MIN_SEG) after.push(piece(v, start, v.sourceEnd, rangeStart))
    }
  }

  return { before, inside, after }
}

function piece(
  v: SegmentView,
  sourceStart: number,
  sourceEnd: number,
  timelineOffset: number,
  id = createId(),
): Segment {
  return {
    id,
    sourceId: v.sourceId,
    sourceStart,
    sourceEnd,
    trimStart: sourceStart,
    trimEnd: sourceEnd,
    timelineOffset: Math.max(0, timelineOffset),
  }
}

function bare(v: SegmentView): Segment {
  return piece(v, v.sourceStart, v.sourceEnd, v.timelineStart, v.id)
}

// ─────────────────────────────────────────────

const HISTORY_LIMIT = 100

export function useTimeline() {
  const [sources, setSources] = useState<Map<string, VideoSource>>(new Map())
  const [segments, setSegmentsState] = useState<Segment[]>([])
  // Latest segments, readable synchronously. Edits and history are computed from this ref
  // instead of inside React state updaters, which StrictMode runs twice.
  const segmentsRef = useRef<Segment[]>([])
  const [textSegments, setTextSegments] = useState<TextSegment[]>([])
  const [hasTextTrack, setHasTextTrack] = useState(false)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [copiedClip, setCopiedClip] = useState<Segment | null>(null)
  const [clipboard, setClipboard] = useState<Segment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const urlsRef = useRef<Map<string, string>>(new Map())
  const filmstripControllersRef = useRef<Map<string, AbortController>>(new Map())

  // ── Undo / Redo stacks ──────────────────────────────────────────────────────
  const undoStack = useRef<Segment[][]>([])
  const redoStack = useRef<Segment[][]>([])

  /** Call before any state-mutating operation to record current state. */
  const pushHistory = useCallback((current: Segment[]) => {
    undoStack.current.push(current)
    if (undoStack.current.length > HISTORY_LIMIT)
      undoStack.current.shift()
    redoStack.current = []
  }, [])

  const commitSegments = useCallback((next: Segment[]) => {
    segmentsRef.current = next
    setSegmentsState(next)
  }, [])

  const setSegments = useCallback(
    (updater: (prev: Segment[]) => Segment[]) => commitSegments(updater(segmentsRef.current)),
    [commitSegments],
  )

  const saveHistory = useCallback(() => {
    pushHistory(segmentsRef.current)
  }, [pushHistory])

  const setSegmentsWithHistory = useCallback(
    (updater: (prev: Segment[]) => Segment[]) => {
      const prev = segmentsRef.current
      const next = updater(prev)
      if (next === prev) return
      pushHistory(prev)
      commitSegments(next)
    },
    [pushHistory, commitSegments],
  )

  const undo = useCallback(() => {
    const snapshot = undoStack.current.pop()
    if (!snapshot) return
    redoStack.current.push(segmentsRef.current)
    commitSegments(snapshot)
  }, [commitSegments])

  const redo = useCallback(() => {
    const snapshot = redoStack.current.pop()
    if (!snapshot) return
    undoStack.current.push(segmentsRef.current)
    commitSegments(snapshot)
  }, [commitSegments])

  useEffect(
    () => () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
      for (const controller of filmstripControllersRef.current.values()) controller.abort()
    },
    [],
  )

  const views = useMemo(() => computeViews(segments), [segments])
  const totalDuration = useMemo(
    () => views.reduce((end, view) => Math.max(end, view.timelineStart + view.timelineDuration), 0),
    [views],
  )

  // ── Source / file management ────────────────────────────────────────────────

  const addFiles = useCallback(async (files: File[]) => {
    const videoFiles = files.filter(isVideoFile)
    if (!videoFiles.length) { setError('No video files found.'); return }
    setBusy(true)
    setError(null)

    for (const file of videoFiles) {
      const url = URL.createObjectURL(file)
      try {
        const meta = await probe(url)
        const id = createId()
        urlsRef.current.set(id, url)
        const source: VideoSource = {
          id, file, url,
          path: desktop?.pathForFile(file) || undefined,
          name: baseName(file.name),
          extension: extensionOf(file.name),
          size: file.size,
          duration: meta.duration,
          width: meta.width,
          height: meta.height,
          filmstrip: [],
        }
        setSources((prev) => new Map(prev).set(id, source))
        setSegments((prev) => {
          const vs = computeViews(prev)
          const lastEnd = vs.reduce(
            (end, view) => Math.max(end, view.timelineStart + view.timelineDuration),
            0,
          )
          return [
            ...prev,
            {
              id: createId(),
              sourceId: id,
              sourceStart: 0,
              sourceEnd: meta.duration,
              trimStart: 0,
              trimEnd: meta.duration,
              timelineOffset: lastEnd,
            },
          ]
        })

        const controller = new AbortController()
        filmstripControllersRef.current.set(id, controller)
        void captureFilmstrip({
          url,
          duration: meta.duration,
          count: FILMSTRIP_FRAMES,
          signal: controller.signal,
          onFrame: (index, frame) => {
            setSources((prev) => {
              const current = prev.get(id)
              if (!current) return prev
              const filmstrip = [...(current.filmstrip ?? [])]
              filmstrip[index] = frame
              return new Map(prev).set(id, { ...current, filmstrip })
            })
          },
        }).finally(() => filmstripControllersRef.current.delete(id))
      } catch (cause) {
        URL.revokeObjectURL(url)
        setError(cause instanceof Error ? cause.message : 'Could not open file.')
      }
    }

    setBusy(false)
  }, [setSegments])

  // ── Edit operations ─────────────────────────────────────────────────────────

  /** Split a segment at the given unified-timeline position. */
  const splitAt = useCallback((atTime: number) => {
    setSegmentsWithHistory((prev) => {
      const vs = computeViews(prev)
      const v = vs.find(
        (x) => atTime > x.timelineStart + MIN_SEG && atTime < x.timelineStart + x.timelineDuration - MIN_SEG,
      )
      if (!v) return prev
      const splitSrc = v.sourceStart + (atTime - v.timelineStart)
      const idx = prev.findIndex((s) => s.id === v.id)
      const next = [...prev]
      const leftId = createId()
      const rightId = createId()
      next.splice(
        idx, 1,
        {
          id: leftId,
          sourceId: v.sourceId,
          sourceStart: v.sourceStart,
          sourceEnd: splitSrc,
          trimStart: v.sourceStart,
          trimEnd: splitSrc,
          timelineOffset: v.timelineStart,
        },
        {
          id: rightId,
          sourceId: v.sourceId,
          sourceStart: splitSrc,
          sourceEnd: v.sourceEnd,
          trimStart: splitSrc,
          trimEnd: v.sourceEnd,
          timelineOffset: v.timelineStart + (splitSrc - v.sourceStart),
        },
      )
      setSelectedClipId((curr) => (curr === v.id ? rightId : curr))
      return next
    })
  }, [setSegmentsWithHistory])

  /** Copy a single selected clip into `copiedClip` / `clipboard`. */
  const copyClip = useCallback((segId: string) => {
    setSegments((prev) => {
      const target = prev.find((s) => s.id === segId)
      if (target) {
        const snapshot: Segment = {
          ...target,
          trimStart: target.trimStart ?? target.sourceStart,
          trimEnd: target.trimEnd ?? target.sourceEnd,
        }
        setCopiedClip(snapshot)
        setClipboard([snapshot])
      }
      return prev
    })
  }, [setSegments])

  /** Cut a single selected clip (copy into `copiedClip` + remove from timeline). */
  const cutClip = useCallback((segId: string) => {
    setSegmentsWithHistory((prev) => {
      const target = prev.find((s) => s.id === segId)
      if (!target) return prev
      const snapshot: Segment = {
        ...target,
        trimStart: target.trimStart ?? target.sourceStart,
        trimEnd: target.trimEnd ?? target.sourceEnd,
      }
      setCopiedClip(snapshot)
      setClipboard([snapshot])
      return prev.filter((s) => s.id !== segId)
    })
    setSelectedClipId((curr) => (curr === segId ? null : curr))
  }, [setSegmentsWithHistory])

  /** Delete a single selected clip from the timeline. */
  const deleteClip = useCallback((segId: string) => {
    setSegmentsWithHistory((prev) => prev.filter((s) => s.id !== segId))
    setSelectedClipId((curr) => (curr === segId ? null : curr))
  }, [setSegmentsWithHistory])

  /** Delete a timeline range (ripple-deletes). */
  const deleteRange = useCallback((start: number, end: number) => {
    setSegmentsWithHistory((prev) => {
      const vs = computeViews(prev)
      const { before, after } = sliceByRange(vs, start, end)
      return [...before, ...after]
    })
  }, [setSegmentsWithHistory])

  /** Copy a range to the internal clipboard. */
  const copyRange = useCallback((start: number, end: number) => {
    setSegments((prev) => {
      const vs = computeViews(prev)
      const { inside } = sliceByRange(vs, start, end)
      setClipboard(inside)
      if (inside.length > 0) setCopiedClip(inside[0])
      return prev // copy doesn't mutate segments, no history push needed
    })
  }, [setSegments])

  /** Cut a range (copy + ripple-delete). */
  const cutRange = useCallback((start: number, end: number) => {
    setSegmentsWithHistory((prev) => {
      const vs = computeViews(prev)
      const { before, inside, after } = sliceByRange(vs, start, end)
      setClipboard(inside)
      if (inside.length > 0) setCopiedClip(inside[0])
      return [...before, ...after]
    })
  }, [setSegmentsWithHistory])

  /**
   * Paste `copiedClip` (or `clipboard`) directly at `atTime` (the Playhead's currentTime).
   * If `atTime` falls inside an existing clip, splits that clip and inserts/ripples
   * subsequent clips forward so no clips overlap.
   */
  const pasteAt = useCallback((atTime: number) => {
    const itemsToPaste = copiedClip ? [copiedClip] : clipboard
    if (!itemsToPaste?.length) return

    const pasteStart = Math.max(0, atTime)
    let cursor = pasteStart
    const pastedSegs: Segment[] = itemsToPaste.map((s) => {
      const srcStart = s.trimStart ?? s.sourceStart
      const srcEnd = s.trimEnd ?? s.sourceEnd
      const dur = Math.max(0, srcEnd - srcStart)
      const seg: Segment = {
        id: createId(),
        sourceId: s.sourceId,
        sourceStart: srcStart,
        sourceEnd: srcEnd,
        trimStart: srcStart,
        trimEnd: srcEnd,
        timelineOffset: cursor,
      }
      cursor += dur
      return seg
    })
    const totalPasteDur = cursor - pasteStart

    setSegmentsWithHistory((prev) => {
      const vs = [...computeViews(prev)].sort((a, b) => a.timelineStart - b.timelineStart)
      const beforeList: Segment[] = []
      const afterList: Segment[] = []

      for (const v of vs) {
        const segEnd = v.timelineStart + v.timelineDuration
        if (segEnd <= pasteStart + MIN_SEG) {
          // Completely before paste point
          beforeList.push(bare(v))
        } else if (v.timelineStart < pasteStart - MIN_SEG && segEnd > pasteStart + MIN_SEG) {
          // Playhead is strictly inside clip `v`: split `v` into left and right pieces
          const splitSrc = v.sourceStart + (pasteStart - v.timelineStart)
          beforeList.push({
            id: createId(),
            sourceId: v.sourceId,
            sourceStart: v.sourceStart,
            sourceEnd: splitSrc,
            trimStart: v.sourceStart,
            trimEnd: splitSrc,
            timelineOffset: v.timelineStart,
          })
          afterList.push({
            id: createId(),
            sourceId: v.sourceId,
            sourceStart: splitSrc,
            sourceEnd: v.sourceEnd,
            trimStart: splitSrc,
            trimEnd: v.sourceEnd,
            timelineOffset: pasteStart + totalPasteDur,
          })
        } else {
          // Starts at or after paste point
          afterList.push(bare(v))
        }
      }

      // Ripple-shift any clips in `afterList` that would overlap the inserted clip(s)
      let minAllowedStart = pasteStart + totalPasteDur
      const rippledAfter = afterList.map((seg) => {
        const dur = Math.max(0, (seg.trimEnd ?? seg.sourceEnd) - (seg.trimStart ?? seg.sourceStart))
        const origStart = seg.timelineOffset ?? 0
        if (origStart < minAllowedStart) {
          const shifted: Segment = { ...seg, timelineOffset: minAllowedStart }
          minAllowedStart += dur
          return shifted
        }
        minAllowedStart = origStart + dur
        return seg
      })

      return [...beforeList, ...pastedSegs, ...rippledAfter]
    })

    if (pastedSegs[0]) {
      setSelectedClipId(pastedSegs[0].id)
    }
  }, [copiedClip, clipboard, setSegmentsWithHistory])

  /**
   * Trim a segment's in/out point (trimStart / trimEnd).
   * maxSourceDur is the full duration of the source video (to clamp the out point).
   */
  const trimSegment = useCallback(
    (
      segId: string,
      edge: 'start' | 'end',
      newSourceTime: number,
      maxSourceDur: number,
      newTimelineOffset?: number,
    ) => {
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id !== segId) return s
          if (edge === 'start') {
            const clamped = Math.max(0, Math.min(newSourceTime, s.sourceEnd - MIN_SEG))
            return {
              ...s,
              sourceStart: clamped,
              trimStart: clamped,
              ...(newTimelineOffset !== undefined
                ? { timelineOffset: Math.max(0, newTimelineOffset) }
                : {}),
            }
          }
          const clamped = Math.max(s.sourceStart + MIN_SEG, Math.min(newSourceTime, maxSourceDur))
          return {
            ...s,
            sourceEnd: clamped,
            trimEnd: clamped,
            ...(newTimelineOffset !== undefined
              ? { timelineOffset: Math.max(0, newTimelineOffset) }
              : {}),
          }
        }),
      )
    },
    [setSegments],
  )

  /** Remove a single segment from the timeline. */
  const removeSegment = useCallback((segId: string) => {
    setSegmentsWithHistory((prev) => prev.filter((s) => s.id !== segId))
    setSelectedClipId((curr) => (curr === segId ? null : curr))
  }, [setSegmentsWithHistory])

  /** Reorder two segments by index. */
  const moveSegment = useCallback((fromIdx: number, toIdx: number) => {
    setSegmentsWithHistory((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [setSegmentsWithHistory])

  const moveSegmentTo = useCallback((segId: string, timelineOffset: number) => {
    setSegments((prev) =>
      prev.map((segment) =>
        segment.id === segId ? { ...segment, timelineOffset: Math.max(0, timelineOffset) } : segment,
      ),
    )
  }, [setSegments])

  // ── Independent Text Track operations ───────────────────────────────────────

  const addTextSegment = useCallback((atTime: number) => {
    const newId = createId()
    setHasTextTrack(true)
    setTextSegments((prev) => {
      const defaultDur = Math.min(3, Math.max(1.5, totalDuration > 0 ? totalDuration * 0.35 : 3))
      let start = Math.max(0, atTime)
      // If another text clip already starts at roughly the same time, place after it so they don't overlap
      const sorted = [...prev].sort((a, b) => a.timelineStart - b.timelineStart)
      for (const existing of sorted) {
        const exEnd = existing.timelineStart + existing.duration
        if (start < exEnd - 0.01 && start + defaultDur > existing.timelineStart + 0.01) {
          start = exEnd
        }
      }
      const nextSeg: TextSegment = {
        id: newId,
        text: 'Sample Text',
        fontFamily: 'Inter',
        fontSize: 38,
        color: '#ffffff',
        x: 50,
        y: 50,
        timelineStart: start,
        duration: defaultDur,
      }
      return [...prev, nextSeg]
    })
    setSelectedClipId(null)
    setSelectedTextId(newId)
  }, [totalDuration])

  const updateTextSegment = useCallback((id: string, patch: Partial<TextSegment>) => {
    setTextSegments((prev) =>
      prev.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)),
    )
  }, [])

  const removeTextSegment = useCallback((id: string) => {
    setTextSegments((prev) => prev.filter((seg) => seg.id !== id))
    setSelectedTextId((curr) => (curr === id ? null : curr))
  }, [])

  return {
    sources,
    segments,
    views,
    textSegments,
    hasTextTrack,
    totalDuration,
    selectedClipId,
    setSelectedClipId,
    selectedTextId,
    setSelectedTextId,
    copiedClip,
    clipboard,
    error,
    busy,
    addFiles,
    splitAt,
    copyClip,
    cutClip,
    deleteClip,
    deleteRange,
    copyRange,
    cutRange,
    pasteAt,
    trimSegment,
    removeSegment,
    moveSegment,
    moveSegmentTo,
    addTextSegment,
    updateTextSegment,
    removeTextSegment,
    saveHistory,
    undo,
    redo,
    dismissError: () => setError(null),
  }
}
