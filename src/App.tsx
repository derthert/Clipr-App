// Wires the editor together: one source, one selection, one queue.

import { useEffect, useRef, useState } from 'react'
import type { ExportSettings, Preferences, Selection } from './types'
import { APP_NAME, FILMSTRIP_FRAMES, REPO_URL, WAVEFORM_BUCKETS } from './config'
import { DropZone } from './components/DropZone'
import { Header } from './components/Header'
import { Player } from './components/Player'
import { QueueStrip } from './components/QueueStrip'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { Timeline } from './components/Timeline'
import { TrimBar } from './components/TrimBar'
import { useEngineStatus } from './hooks/useEngineStatus'
import { useExportQueue } from './hooks/useExportQueue'
import { useHotkeys } from './hooks/useHotkeys'
import { usePersistentState } from './hooks/usePersistentState'
import { useVideoPlayback } from './hooks/useVideoPlayback'
import { useVideoSource } from './hooks/useVideoSource'
import { isDesktop } from './lib/desktop'
import { ensureEngine, previewCommand } from './lib/ffmpeg'
import { VIDEO_ACCEPT } from './lib/file'
import { captureFilmstrip } from './lib/filmstrip'
import { extractPeaks } from './lib/waveform'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_SETTINGS,
  MIN_CLIP_DURATION,
  buildFileName,
  outputExtension,
} from './lib/settings'
import { clamp } from './lib/time'

export default function App() {
  const { source, error, busy, open, dismissError } = useVideoSource()
  const settings = usePersistentState<ExportSettings>('clipr.settings.v2', DEFAULT_SETTINGS)
  const preferences = usePersistentState<Preferences>('clipr.preferences.v1', DEFAULT_PREFERENCES)
  const queue = useExportQueue()
  const engine = useEngineStatus()

  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 })
  const [frames, setFrames] = useState<(string | undefined)[]>([])
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const [dialog, setDialog] = useState<'none' | 'shortcuts' | 'settings'>('none')
  const fileInput = useRef<HTMLInputElement>(null)

  const duration = source?.duration ?? 0
  const playback = useVideoPlayback(source?.url, {
    start: selection.start,
    end: selection.end,
    confine: preferences.value.loopSelection,
  })

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.value.theme
  }, [preferences.value.theme])

  useEffect(() => {
    document.title = source ? `${source.file.name} · ${APP_NAME}` : APP_NAME
  }, [source])

  useEffect(() => {
    if (!source) return
    setSelection({ start: 0, end: source.duration })
    setFrames(new Array(FILMSTRIP_FRAMES).fill(undefined))
    setPeaks(null)

    const controller = new AbortController()
    void extractPeaks({ file: source.file, buckets: WAVEFORM_BUCKETS, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPeaks(result)
      })
      .catch(() => undefined)
    void captureFilmstrip({
      url: source.url,
      duration: source.duration,
      count: FILMSTRIP_FRAMES,
      signal: controller.signal,
      onFrame: (index, dataUrl) =>
        setFrames((current) => {
          const next = [...current]
          next[index] = dataUrl
          return next
        }),
    })

    const warmup = isDesktop
      ? 0
      : window.setTimeout(() => void ensureEngine().catch(() => undefined), 1500)
    return () => {
      controller.abort()
      window.clearTimeout(warmup)
    }
  }, [source])

  const clipLength = selection.end - selection.start
  const canExport = Boolean(source) && clipLength >= MIN_CLIP_DURATION
  const extension = outputExtension(settings.value, source?.extension ?? '')

  const pickFile = () => fileInput.current?.click()

  const markIn = () => {
    const start = clamp(playback.time, 0, duration - MIN_CLIP_DURATION)
    setSelection((current) => ({ start, end: Math.max(current.end, start + MIN_CLIP_DURATION) }))
  }

  const markOut = () => {
    const end = clamp(playback.time, MIN_CLIP_DURATION, duration)
    setSelection((current) => ({ start: Math.min(current.start, end - MIN_CLIP_DURATION), end }))
  }

  const resetSelection = () => setSelection({ start: 0, end: duration })

  const nudge = (delta: number) => playback.seek(clamp(playback.time + delta, 0, duration))

  const exportClip = () => {
    if (!source || !canExport) return false
    queue.enqueue({
      fileName: buildFileName({
        sourceName: source.name,
        start: selection.start,
        end: selection.end,
        extension,
      }),
      sourceName: source.name,
      file: source.file,
      sourcePath: source.path,
      sourceHeight: source.height,
      extension,
      start: selection.start,
      end: selection.end,
      settings: settings.value,
    })
    return true
  }

  const exportAndAdvance = () => {
    if (!exportClip() || !source) return
    if (selection.end >= duration - MIN_CLIP_DURATION) return
    const start = selection.end
    setSelection({ start, end: Math.min(duration, start + clipLength) })
    playback.seek(start)
  }

  useHotkeys(
    {
      space: playback.toggle,
      i: markIn,
      o: markOut,
      r: resetSelection,
      l: () => preferences.patch({ loopSelection: !preferences.value.loopSelection }),
      m: playback.toggleMuted,
      q: exportAndAdvance,
      'mod+enter': exportClip,
      arrowleft: () => nudge(-0.1),
      arrowright: () => nudge(0.1),
      'shift+arrowleft': () => nudge(-1),
      'shift+arrowright': () => nudge(1),
      'alt+arrowleft': () => nudge(-0.04),
      'alt+arrowright': () => nudge(0.04),
      home: () => playback.seek(selection.start),
      end: () => playback.seek(selection.end),
      '?': () => setDialog('shortcuts'),
      'shift+?': () => setDialog('shortcuts'),
    },
    Boolean(source),
  )

  // Escape has to work even before a video is open, since the dialogs do too.
  useHotkeys({ escape: () => setDialog('none') }, dialog !== 'none')

  return (
    <div
      className="app"
      onDragOver={(event) => {
        if (source) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!source) return
        event.preventDefault()
        const file = event.dataTransfer.files[0]
        if (file) void open(file)
      }}
    >
      <Header
        source={source}
        theme={preferences.value.theme}
        onPick={pickFile}
        onToggleTheme={() =>
          preferences.patch({ theme: preferences.value.theme === 'dark' ? 'light' : 'dark' })
        }
        onShortcuts={() => setDialog('shortcuts')}
        onSettings={() => setDialog('settings')}
      />

      {source ? (
        <main className="workspace">
          {error ? (
            <p className="banner" role="alert" onClick={dismissError}>
              {error}
            </p>
          ) : null}

          <Player
            url={source.url}
            videoRef={playback.videoRef}
            time={playback.time}
            duration={duration}
            playing={playback.playing}
            rate={playback.rate}
            muted={playback.muted}
            loop={preferences.value.loopSelection}
            selection={selection}
            onToggle={playback.toggle}
            onSeek={playback.seek}
            onRate={playback.changeRate}
            onToggleMuted={playback.toggleMuted}
            onToggleLoop={() =>
              preferences.patch({ loopSelection: !preferences.value.loopSelection })
            }
          />

          <Timeline
            duration={duration}
            selection={selection}
            time={playback.time}
            frames={frames}
            peaks={peaks}
            onChange={setSelection}
            onSeek={playback.seek}
          />

          <TrimBar
            selection={selection}
            duration={duration}
            canExport={canExport}
            onChange={setSelection}
            onMarkIn={markIn}
            onMarkOut={markOut}
            onReset={resetSelection}
            onExport={exportClip}
            onExportNext={exportAndAdvance}
          />

          <QueueStrip
            jobs={queue.jobs}
            engine={engine}
            onCancel={queue.cancel}
            onRetry={queue.retry}
            onRemove={queue.remove}
            onClearFinished={queue.clearFinished}
          />
        </main>
      ) : (
        <>
          <DropZone onFile={open} onPick={pickFile} busy={busy} error={error} />
          <footer className="footer">
            <span>{isDesktop ? 'Cuts with a bundled ffmpeg.' : 'Cuts with ffmpeg.wasm.'}</span>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source
            </a>
          </footer>
        </>
      )}

      {dialog === 'shortcuts' ? <ShortcutsDialog onClose={() => setDialog('none')} /> : null}
      {dialog === 'settings' ? (
        <SettingsDialog
          settings={settings.value}
          onChange={settings.patch}
          onReset={settings.reset}
          onClose={() => setDialog('none')}
          sourceExtension={source?.extension ?? ''}
          command={previewCommand({
            start: selection.start,
            end: selection.end,
            settings: settings.value,
            extension,
            sourceHeight: source?.height,
          })}
        />
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept={VIDEO_ACCEPT}
        className="visually-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void open(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}
