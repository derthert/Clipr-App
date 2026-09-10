// Opens a local file, reads its metadata and keeps exactly one object URL alive.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { VideoSource } from '../types'
import { desktop } from '../lib/desktop'
import { baseName, extensionOf, isVideoFile } from '../lib/file'

const METADATA_TIMEOUT = 15000

function probe(url: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    const timer = window.setTimeout(() => finish(new Error('Reading this file timed out.')), METADATA_TIMEOUT)

    const finish = (error?: Error) => {
      window.clearTimeout(timer)
      video.removeAttribute('src')
      video.load()
      if (error) reject(error)
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
        // Streamed containers report Infinity until they are seeked to the end.
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

export function useVideoSource() {
  const [source, setSource] = useState<VideoSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const urlRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])

  const open = useCallback(async (file: File) => {
    if (!isVideoFile(file)) {
      setError('That is not a video file.')
      return
    }
    setBusy(true)
    setError(null)
    const url = URL.createObjectURL(file)
    try {
      const meta = await probe(url)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      urlRef.current = url
      setSource({
        file,
        url,
        path: desktop?.pathForFile(file) || undefined,
        name: baseName(file.name),
        extension: extensionOf(file.name),
        size: file.size,
        duration: meta.duration,
        width: meta.width,
        height: meta.height,
      })
    } catch (cause) {
      URL.revokeObjectURL(url)
      setError(cause instanceof Error ? cause.message : 'Could not open this file.')
    } finally {
      setBusy(false)
    }
  }, [])

  const close = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = null
    setSource(null)
    setError(null)
  }, [])

  return { source, error, busy, open, close, dismissError: () => setError(null) }
}
