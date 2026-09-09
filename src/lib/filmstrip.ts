// Grabs evenly spaced thumbnails from a video so the timeline shows what it is cutting.

const THUMB_HEIGHT = 56
const SEEK_TIMEOUT = 4000

interface FilmstripOptions {
  url: string
  duration: number
  count: number
  signal: AbortSignal
  onFrame: (index: number, dataUrl: string) => void
}

function waitForEvent(target: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting for ${event}`))
    }, SEEK_TIMEOUT)
    const cleanup = () => {
      window.clearTimeout(timer)
      target.removeEventListener(event, onDone)
      target.removeEventListener('error', onFail)
    }
    const onDone = () => {
      cleanup()
      resolve()
    }
    const onFail = () => {
      cleanup()
      reject(new Error('video error'))
    }
    target.addEventListener(event, onDone, { once: true })
    target.addEventListener('error', onFail, { once: true })
  })
}

export async function captureFilmstrip({
  url,
  duration,
  count,
  signal,
  onFrame,
}: FilmstripOptions): Promise<void> {
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.preload = 'auto'
  video.playsInline = true

  try {
    await waitForEvent(video, 'loadeddata')
    if (!video.videoWidth) return

    const canvas = document.createElement('canvas')
    const ratio = video.videoWidth / video.videoHeight
    canvas.height = THUMB_HEIGHT
    canvas.width = Math.max(16, Math.round(THUMB_HEIGHT * ratio))
    const context = canvas.getContext('2d')
    if (!context) return

    for (let index = 0; index < count; index += 1) {
      if (signal.aborted) return
      video.currentTime = Math.min(duration - 0.05, (duration * (index + 0.5)) / count)
      await waitForEvent(video, 'seeked')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      onFrame(index, canvas.toDataURL('image/jpeg', 0.55))
    }
  } catch {
    // A codec the browser cannot seek is not fatal, the timeline just stays plain.
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}
