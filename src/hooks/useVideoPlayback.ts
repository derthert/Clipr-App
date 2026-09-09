// Playback state for the preview, including keeping playback inside the selection.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PlaybackBounds {
  start: number
  end: number
  confine: boolean
}

const EDGE = 0.02

export function useVideoPlayback(src: string | undefined, bounds: PlaybackBounds) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const boundsRef = useRef(bounds)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [muted, setMuted] = useState(false)

  boundsRef.current = bounds

  useEffect(() => {
    setTime(0)
    setPlaying(false)
  }, [src])

  useEffect(() => {
    if (!src) return
    let frame = requestAnimationFrame(function tick() {
      const video = videoRef.current
      if (video) {
        const { start, end, confine } = boundsRef.current
        if (confine && !video.paused && video.currentTime >= end - EDGE) {
          video.currentTime = start
        }
        setTime(video.currentTime)
      }
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
    }
  }, [src])

  const seek = useCallback((next: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, next)
    setTime(video.currentTime)
  }, [])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const { start, end, confine } = boundsRef.current
    if (confine && (video.currentTime < start || video.currentTime >= end - EDGE)) {
      video.currentTime = start
    }
    void video.play().catch(() => undefined)
  }, [])

  const pause = useCallback(() => videoRef.current?.pause(), [])

  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) play()
    else video.pause()
  }, [play])

  const changeRate = useCallback((next: number) => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = next
    setRate(next)
  }, [])

  const toggleMuted = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }, [])

  return { videoRef, time, playing, rate, muted, seek, play, pause, toggle, changeRate, toggleMuted }
}
