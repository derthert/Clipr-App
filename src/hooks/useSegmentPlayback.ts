// Manages video playback across a multi-segment unified timeline.
// A single <video> element is reused; its src is swapped when the playhead
// crosses a segment boundary. Gaps between segments play continuously as a
// black screen (blank frame) rather than being skipped.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SegmentView, VideoSource } from '../types'

interface PlaybackOpts {
  loopSelection?: boolean
  selStart?: number
  selEnd?: number
}

const EPS = 0.005

export function useSegmentPlayback(
  views: SegmentView[],
  sources: Map<string, VideoSource>,
  opts: PlaybackOpts = {},
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [isGap, setIsGap] = useState(false)
  const [muted, setMuted] = useState(false)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)

  // Mutable refs (avoid stale closures in event listeners & rAF loop)
  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const isGapRef = useRef(false)
  const rateRef = useRef(1)
  const lastFrameTimeRef = useRef<number | null>(null)
  const activeViewIdRef = useRef<string | null>(null)
  const activeSourceUrlRef = useRef<string | null>(null)
  const pendingSeekRef = useRef<{ sourceTime: number; autoPlay: boolean } | null>(null)
  const viewsRef = useRef(views)
  const sourcesRef = useRef(sources)
  const optsRef = useRef(opts)

  viewsRef.current = views
  sourcesRef.current = sources
  optsRef.current = opts
  rateRef.current = rate

  const sortedViewsMemo = useMemo(() => {
    return [...views].sort((a, b) => a.timelineStart - b.timelineStart)
  }, [views])

  const sortedViewsRef = useRef(sortedViewsMemo)
  sortedViewsRef.current = sortedViewsMemo

  const setGapState = useCallback((nextGap: boolean) => {
    isGapRef.current = nextGap
    setIsGap(nextGap)
  }, [])

  const computeTotalDuration = useCallback(() => {
    return viewsRef.current.reduce(
      (end, view) => Math.max(end, view.timelineStart + view.timelineDuration),
      0,
    )
  }, [])

  const totalDuration = views.reduce(
    (end, view) => Math.max(end, view.timelineStart + view.timelineDuration),
    0,
  )

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getSortedViews(): SegmentView[] {
    return sortedViewsRef.current
  }

  /**
   * Returns the segment strictly covering timeline time `t` (or the final segment
   * if `t` is right at the end of the timeline while paused). Returns undefined if `t` is in a gap.
   */
  function findActiveSegmentAt(t: number, allowEndEdge = false): SegmentView | undefined {
    const sorted = getSortedViews()
    for (const v of sorted) {
      const segEnd = v.timelineStart + v.timelineDuration
      if (t >= v.timelineStart - EPS && t < segEnd - EPS) {
        return v
      }
    }
    if (allowEndEdge && sorted.length > 0) {
      const last = sorted[sorted.length - 1]
      const lastEnd = last.timelineStart + last.timelineDuration
      if (Math.abs(t - lastEnd) <= 0.02) {
        return last
      }
    }
    return undefined
  }

  /**
   * Returns the next segment whose start is at or after `t - EPS`.
   */
  function findUpcomingSegmentAfter(t: number, excludeId?: string): SegmentView | undefined {
    const sorted = getSortedViews()
    return sorted.find(
      (v) => v.id !== excludeId && v.timelineStart >= t - 0.02,
    )
  }

  /**
   * Load a source into the video element (or just seek if already loaded).
   * Optionally auto-play after the seek is ready.
   */
  const applySource = useCallback(
    (view: SegmentView, sourceTime: number, autoPlay: boolean) => {
      const video = videoRef.current
      if (!video) return
      const source = sourcesRef.current.get(view.sourceId)
      if (!source) return

      const clampedSourceTime = Math.max(
        view.sourceStart,
        Math.min(sourceTime, view.sourceEnd),
      )

      const sameSource = activeSourceUrlRef.current === source.url && video.src === source.url

      if (!sameSource) {
        activeSourceUrlRef.current = source.url
        pendingSeekRef.current = { sourceTime: clampedSourceTime, autoPlay }
        video.src = source.url
        video.load()
        const onReady = () => {
          const pending = pendingSeekRef.current
          if (!pending) return
          pendingSeekRef.current = null
          video.currentTime = pending.sourceTime
          video.playbackRate = rateRef.current
          if (pending.autoPlay && playingRef.current && !isGapRef.current) {
            void video.play().catch(() => undefined)
          }
        }
        video.addEventListener('loadedmetadata', onReady, { once: true })
      } else if (video.readyState < 1) {
        pendingSeekRef.current = { sourceTime: clampedSourceTime, autoPlay }
      } else {
        if (Math.abs(video.currentTime - clampedSourceTime) > 0.005) {
          video.currentTime = clampedSourceTime
        }
        if (autoPlay && video.paused && playingRef.current && !isGapRef.current) {
          void video.play().catch(() => undefined)
        }
      }
    },
    [],
  )

  // Keep preview synced with edits (trim / move / paste / cut) while paused
  useEffect(() => {
    if (views.length === 0) {
      activeViewIdRef.current = null
      videoRef.current?.pause()
      setGapState(true)
      return
    }
    if (playingRef.current) return

    const activeSeg = findActiveSegmentAt(timeRef.current, true)
    if (activeSeg) {
      setGapState(false)
      activeViewIdRef.current = activeSeg.id
      const srcTime = activeSeg.sourceStart + (timeRef.current - activeSeg.timelineStart)
      applySource(activeSeg, srcTime, false)
    } else {
      setGapState(true)
      activeViewIdRef.current = null
      videoRef.current?.pause()
      const upcoming = findUpcomingSegmentAfter(timeRef.current)
      if (upcoming) {
        applySource(upcoming, upcoming.sourceStart, false)
      }
    }
  }, [views, sources, applySource, setGapState])

  // ── Seek (Scrubbing) ─────────────────────────────────────────────────────────

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.max(0, t)
      timeRef.current = clamped
      setTime(clamped)
      lastFrameTimeRef.current = performance.now()

      const activeSeg = findActiveSegmentAt(clamped, !playingRef.current)
      if (activeSeg) {
        setGapState(false)
        activeViewIdRef.current = activeSeg.id
        const srcTime = activeSeg.sourceStart + (clamped - activeSeg.timelineStart)
        applySource(activeSeg, srcTime, playingRef.current)
      } else {
        setGapState(true)
        activeViewIdRef.current = null
        videoRef.current?.pause()
        const upcoming = findUpcomingSegmentAfter(clamped)
        if (upcoming) {
          applySource(upcoming, upcoming.sourceStart, false)
        }
      }
    },
    [applySource, setGapState],
  )

  // ── Play / Pause / Toggle ─────────────────────────────────────────────────────

  const pause = useCallback(() => {
    videoRef.current?.pause()
    setPlaying(false)
    playingRef.current = false
    lastFrameTimeRef.current = null
  }, [])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video || viewsRef.current.length === 0) return

    const td = computeTotalDuration()
    let targetTime = timeRef.current
    // If playhead is at or past the end of the timeline, restart from 0
    if (targetTime >= td - 0.02) {
      targetTime = 0
    }

    timeRef.current = targetTime
    setTime(targetTime)
    lastFrameTimeRef.current = performance.now()
    setPlaying(true)
    playingRef.current = true

    const activeSeg = findActiveSegmentAt(targetTime, false)
    if (activeSeg) {
      setGapState(false)
      activeViewIdRef.current = activeSeg.id
      const srcTime = activeSeg.sourceStart + (targetTime - activeSeg.timelineStart)
      applySource(activeSeg, srcTime, true)
      void video.play().catch(() => undefined)
    } else {
      // Target time is in a gap: render black screen and advance time via rAF
      setGapState(true)
      activeViewIdRef.current = null
      video.pause()
      const upcoming = findUpcomingSegmentAfter(targetTime)
      if (upcoming) {
        applySource(upcoming, upcoming.sourceStart, false)
      }
    }
  }, [applySource, computeTotalDuration, setGapState])

  const toggle = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [play, pause])

  // ── Synchronize timeline playhead with video.currentTime & gaps ───────────────

  const syncPlayback = useCallback(() => {
    const video = videoRef.current
    if (!video || !playingRef.current) return

    const now = performance.now()
    const prevFrameTime = lastFrameTimeRef.current ?? now
    const dt = Math.max(0, Math.min(0.1, (now - prevFrameTime) / 1000)) * rateRef.current
    lastFrameTimeRef.current = now

    const td = computeTotalDuration()
    const { loopSelection, selStart, selEnd } = optsRef.current

    // ── 1. Currently playing inside a GAP (black screen) ──
    if (isGapRef.current || !activeViewIdRef.current) {
      const nextTL = timeRef.current + dt

      // Selection loop check
      if (
        loopSelection &&
        selStart !== undefined &&
        selEnd !== undefined &&
        selEnd > selStart &&
        nextTL >= selEnd
      ) {
        seek(selStart)
        return
      }

      // Check if we reached or entered a segment
      const enteredSeg = findActiveSegmentAt(nextTL, false)
      if (enteredSeg) {
        setGapState(false)
        activeViewIdRef.current = enteredSeg.id
        const segTime = Math.max(enteredSeg.timelineStart, nextTL)
        timeRef.current = segTime
        setTime(segTime)
        const srcTime = enteredSeg.sourceStart + (segTime - enteredSeg.timelineStart)
        applySource(enteredSeg, srcTime, true)
        void video.play().catch(() => undefined)
        return
      }

      // Check if we reached the end of the timeline
      if (nextTL >= td) {
        pause()
        timeRef.current = td
        setTime(td)
        const endSeg = findActiveSegmentAt(td, true)
        if (endSeg) setGapState(false)
        return
      }

      timeRef.current = nextTL
      setTime(nextTL)
      return
    }

    // ── 2. Currently playing inside an active video segment ──
    const view = viewsRef.current.find((v) => v.id === activeViewIdRef.current)
    if (!view) {
      setGapState(true)
      activeViewIdRef.current = null
      video.pause()
      return
    }

    const srcCurrent = video.currentTime
    const newTL = view.timelineStart + (srcCurrent - view.sourceStart)

    // Selection loop check
    if (
      loopSelection &&
      selStart !== undefined &&
      selEnd !== undefined &&
      selEnd > selStart &&
      newTL >= selEnd
    ) {
      seek(selStart)
      return
    }

    // Segment end boundary reached
    if (srcCurrent >= view.sourceEnd - 0.025 || video.ended) {
      const segEnd = view.timelineStart + view.timelineDuration
      const upcoming = findUpcomingSegmentAfter(segEnd, view.id)

      if (!upcoming) {
        // End of the last segment on the timeline
        pause()
        setGapState(false)
        if (Math.abs(video.currentTime - view.sourceEnd) > 0.01) {
          video.currentTime = view.sourceEnd
        }
        timeRef.current = segEnd
        setTime(segEnd)
        return
      }

      // Check if the next segment is contiguous (no gap) or separated by a gap
      const gapDuration = upcoming.timelineStart - segEnd
      if (gapDuration <= 0.02) {
        // Contiguous: switch immediately to the next segment
        setGapState(false)
        activeViewIdRef.current = upcoming.id
        timeRef.current = upcoming.timelineStart
        setTime(upcoming.timelineStart)
        applySource(upcoming, upcoming.sourceStart, true)
        void video.play().catch(() => undefined)
      } else {
        // Gap exists between this segment and the next: enter gap mode (black screen)
        video.pause()
        setGapState(true)
        activeViewIdRef.current = null
        timeRef.current = segEnd
        setTime(segEnd)
        lastFrameTimeRef.current = performance.now()
        // Pre-cue the upcoming segment while in the gap
        applySource(upcoming, upcoming.sourceStart, false)
      }
      return
    }

    const clampedTL = Math.max(
      view.timelineStart,
      Math.min(newTL, view.timelineStart + view.timelineDuration),
    )
    timeRef.current = clampedTL
    setTime(clampedTL)
  }, [applySource, computeTotalDuration, pause, seek, setGapState])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.addEventListener('timeupdate', syncPlayback)
    return () => video.removeEventListener('timeupdate', syncPlayback)
  }, [syncPlayback])

  useEffect(() => {
    if (!playing) return
    lastFrameTimeRef.current = performance.now()
    let rafId = 0
    const tick = () => {
      syncPlayback()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playing, syncPlayback])

  // ── Controls ─────────────────────────────────────────────────────────────────

  const changeRate = useCallback((r: number) => {
    setRate(r)
    rateRef.current = r
    if (videoRef.current) videoRef.current.playbackRate = r
  }, [])

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev
      if (videoRef.current) videoRef.current.muted = next
      return next
    })
  }, [])

  const changeVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    setVolume(clamped)
    if (videoRef.current) {
      videoRef.current.volume = clamped
      if (clamped > 0 && videoRef.current.muted) {
        videoRef.current.muted = false
        setMuted(false)
      }
    }
  }, [])

  return {
    videoRef,
    time,
    playing,
    isGap,
    muted,
    volume,
    rate,
    totalDuration,
    seek,
    toggle,
    changeRate,
    toggleMuted,
    changeVolume,
  }
}
