// Manages a library of video sources, each with its own trim selection.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Selection, VideoItem, VideoSource } from '../types'
import { desktop } from '../lib/desktop'
import { baseName, extensionOf, isVideoFile } from '../lib/file'

const METADATA_TIMEOUT = 15000

function createId(): string {
  return crypto.randomUUID?.() ?? `vid-${Date.now()}-${Math.random().toString(16).slice(2)}`
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

async function openSource(file: File): Promise<VideoSource> {
  const url = URL.createObjectURL(file)
  try {
    const meta = await probe(url)
    return {
      id: createId(),
      file,
      url,
      path: desktop?.pathForFile(file) || undefined,
      name: baseName(file.name),
      extension: extensionOf(file.name),
      size: file.size,
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
    }
  } catch (cause) {
    URL.revokeObjectURL(url)
    throw cause
  }
}

export function useVideoLibrary() {
  const [items, setItems] = useState<VideoItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Track URLs for cleanup
  const urlsRef = useRef<Map<string, string>>(new Map())

  // Revoke all object URLs on unmount
  useEffect(
    () => () => {
      for (const url of urlsRef.current.values()) URL.revokeObjectURL(url)
    },
    [],
  )

  const addFiles = useCallback(async (files: File[]) => {
    const videoFiles = files.filter(isVideoFile)
    if (videoFiles.length === 0) {
      setError('No valid video files found.')
      return
    }
    setBusy(true)
    setError(null)

    const results: VideoItem[] = []
    for (const file of videoFiles) {
      try {
        const source = await openSource(file)
        const id = createId()
        urlsRef.current.set(id, source.url)
        results.push({ id, source, selection: { start: 0, end: source.duration } })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not open a file.')
      }
    }

    if (results.length > 0) {
      setItems((prev) => {
        const next = [...prev, ...results]
        return next
      })
      // Activate the first newly added item if none active yet
      setActiveId((prev) => prev ?? results[0].id)
    }

    setBusy(false)
  }, [])

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
    const url = urlsRef.current.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      urlsRef.current.delete(id)
    }
    setActiveId((prev) => {
      if (prev !== id) return prev
      // Pick first remaining item that isn't the removed one
      return null
    })
  }, [])

  const setSelection = useCallback((id: string, selection: Selection) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selection } : item)),
    )
  }, [])

  const reorder = useCallback((from: number, to: number) => {
    setItems((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const active = items.find((item) => item.id === activeId) ?? null

  // If active was removed, pick the first available
  useEffect(() => {
    if (activeId && !items.find((item) => item.id === activeId)) {
      setActiveId(items[0]?.id ?? null)
    }
  }, [items, activeId])

  return {
    items,
    active,
    activeId,
    error,
    busy,
    setActiveId,
    addFiles,
    remove,
    setSelection,
    reorder,
    dismissError: () => setError(null),
  }
}
