// Unified timeline editor: multiple videos on one shared timeline.
// Videos are placed end-to-end as Segments. The user can trim, split,
// cut/copy/paste segments, and export everything concatenated.

import { useEffect, useRef, useState } from 'react'
import type { CompositionPiece, ExportSettings, Preferences, Selection } from './types'
import { APP_NAME, REPO_URL } from './config'
import { CompositeTimeline } from './components/CompositeTimeline'
import { DropZone } from './components/DropZone'
import { EditBar } from './components/EditBar'
import { Header } from './components/Header'
import { Player } from './components/Player'
import { QueueStrip } from './components/QueueStrip'
import { SettingsDialog } from './components/SettingsDialog'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { TextPropertiesPanel } from './components/TextPropertiesPanel'
import { useEngineStatus } from './hooks/useEngineStatus'
import { useExportQueue } from './hooks/useExportQueue'
import { useHotkeys } from './hooks/useHotkeys'
import { usePersistentState } from './hooks/usePersistentState'
import { useSegmentPlayback } from './hooks/useSegmentPlayback'
import { useTimeline } from './hooks/useTimeline'
import { isDesktop } from './lib/desktop'
import { ensureEngine, previewCommand } from './lib/ffmpeg'
import { VIDEO_ACCEPT } from './lib/file'
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS, MIN_CLIP_DURATION, buildFileName, outputExtension } from './lib/settings'

const MIN_SEL = 0.04

export default function App() {
  // ── Core state ────────────────────────────────────────────────────────────
  const tl = useTimeline()
  const settings = usePersistentState<ExportSettings>('clipr.settings.v5', DEFAULT_SETTINGS)
  const preferences = usePersistentState<Preferences>('clipr.preferences.v1', DEFAULT_PREFERENCES)
  const queue = useExportQueue()
  const engine = useEngineStatus()

  const [selection, setSelection] = useState<Selection | null>(null)
  const [dialog, setDialog] = useState<'none' | 'shortcuts' | 'settings'>('none')
  const fileInput = useRef<HTMLInputElement>(null)

  // ── Segment-aware playback ────────────────────────────────────────────────
  const playback = useSegmentPlayback(tl.views, tl.sources, {
    loopSelection: preferences.value.loopSelection,
    selStart: selection?.start,
    selEnd: selection?.end,
  })

  // ── Side effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.value.theme
  }, [preferences.value.theme])

  useEffect(() => {
    document.title =
      tl.views.length > 0 ? `${tl.views.length} clip${tl.views.length > 1 ? 's' : ''} · ${APP_NAME}` : APP_NAME
  }, [tl.views.length])

  useEffect(() => {
    if (tl.views.length === 0) return
    const timeout = isDesktop
      ? 0
      : window.setTimeout(() => void ensureEngine().catch(() => undefined), 1500)
    return () => window.clearTimeout(timeout)
  }, [tl.views.length])

  // ── Helpers ───────────────────────────────────────────────────────────────
  const pickFile = () => fileInput.current?.click()
  const hasSel = Boolean(selection && selection.end - selection.start >= MIN_SEL)
  const hasVideos = tl.views.length > 0 || tl.sources.size > 0
  const selectedClip = tl.views.find((v) => v.id === tl.selectedClipId) ?? null
  const selectedText = tl.textSegments.find((t) => t.id === tl.selectedTextId) ?? null

  // Find the first source that has a meaningful extension for settings preview
  const firstSource = [...tl.sources.values()][0]

  // ── Shared edit operations (used by both UI buttons and global hotkeys) ───
  const splitAtPlayhead = () => tl.splitAt(playback.time)

  const handleCut = () => {
    if (tl.selectedClipId) {
      tl.cutClip(tl.selectedClipId)
    } else if (hasSel && selection) {
      tl.cutRange(selection.start, selection.end)
      setSelection(null)
    }
  }

  const handleCopy = () => {
    if (tl.selectedClipId) {
      tl.copyClip(tl.selectedClipId)
    } else if (hasSel && selection) {
      tl.copyRange(selection.start, selection.end)
    }
  }

  const handlePaste = () => {
    tl.pasteAt(playback.time)
  }

  const handleDelete = () => {
    if (tl.selectedTextId) {
      tl.removeTextSegment(tl.selectedTextId)
    } else if (tl.selectedClipId) {
      tl.deleteClip(tl.selectedClipId)
    } else if (hasSel && selection) {
      tl.deleteRange(selection.start, selection.end)
      setSelection(null)
    }
  }

  const handleClearSelection = () => {
    tl.setSelectedClipId(null)
    tl.setSelectedTextId(null)
    setSelection(null)
  }

  // ── Export ────────────────────────────────────────────────────────────────
  /**
   * Enqueues the entire timeline as a single unified composition export job.
   * All clips (with their trimStart/trimEnd) and black-screen gaps between them
   * are concatenated in chronological order into one output file.
   */
  const exportAll = () => {
    const sortedViews = [...tl.views].sort((a, b) => a.timelineStart - b.timelineStart)
    const pieces: CompositionPiece[] = []
    let cursor = 0
    let primarySource = firstSource

    for (const view of sortedViews) {
      const src = tl.sources.get(view.sourceId)
      if (!src) continue
      const dur = view.sourceEnd - view.sourceStart
      if (dur < MIN_CLIP_DURATION) continue

      if (!primarySource) primarySource = src

      const gapDur = view.timelineStart - cursor
      if (gapDur >= 0.04) {
        pieces.push({ kind: 'gap', duration: gapDur })
      }

      pieces.push({
        kind: 'clip',
        file: src.file,
        sourcePath: src.path,
        sourceStart: view.sourceStart,
        sourceEnd: view.sourceEnd,
        duration: dur,
        width: src.width || 1280,
        height: src.height || 720,
      })

      cursor = view.timelineStart + dur
    }

    if (pieces.length === 0 || !primarySource) return

    const hasGaps = pieces.some((p) => p.kind === 'gap')
    const hasTexts = tl.textSegments.some(
      (t) => t.text.trim().length > 0 && t.duration >= MIN_CLIP_DURATION,
    )
    const isMultiOrGap = pieces.length > 1 || hasGaps
    const effectiveSettings: ExportSettings = { ...settings.value, mode: 'precise' }
    const ext = outputExtension(effectiveSettings, primarySource.extension)
    const singleClip = pieces.length === 1 && pieces[0].kind === 'clip' ? pieces[0] : null

    queue.enqueue({
      fileName: buildFileName({
        sourceName: isMultiOrGap || hasTexts ? `${primarySource.name}_timeline` : primarySource.name,
        start: singleClip ? singleClip.sourceStart : 0,
        end: singleClip ? singleClip.sourceEnd : cursor,
        extension: ext,
      }),
      sourceName: primarySource.name,
      file: primarySource.file,
      sourcePath: primarySource.path,
      sourceWidth: primarySource.width || 1280,
      sourceHeight: primarySource.height || 720,
      extension: ext,
      start: singleClip ? singleClip.sourceStart : 0,
      end: singleClip ? singleClip.sourceEnd : cursor,
      pieces,
      textSegments: tl.textSegments,
      settings: effectiveSettings,
    })
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useHotkeys(
    {
      space: playback.toggle,
      s: splitAtPlayhead,
      'm': playback.toggleMuted,
      'l': () => preferences.patch({ loopSelection: !preferences.value.loopSelection }),
      'mod+z': tl.undo,
      'mod+shift+z': tl.redo,
      'mod+y': tl.redo,
      'mod+x': handleCut,
      'mod+c': handleCopy,
      'mod+v': handlePaste,
      delete: handleDelete,
      backspace: handleDelete,
      arrowleft: () => playback.seek(Math.max(0, playback.time - 0.1)),
      arrowright: () => playback.seek(Math.min(tl.totalDuration, playback.time + 0.1)),
      'shift+arrowleft': () => playback.seek(Math.max(0, playback.time - 1)),
      'shift+arrowright': () => playback.seek(Math.min(tl.totalDuration, playback.time + 1)),
      'alt+arrowleft': () => playback.seek(Math.max(0, playback.time - 0.04)),
      'alt+arrowright': () => playback.seek(Math.min(tl.totalDuration, playback.time + 0.04)),
      '?': () => setDialog('shortcuts'),
      'shift+?': () => setDialog('shortcuts'),
    },
    hasVideos,
  )

  useHotkeys(
    {
      escape: () => {
        if (tl.selectedClipId || tl.selectedTextId || selection) handleClearSelection()
        else setDialog('none')
      },
    },
    dialog !== 'none' || Boolean(selection) || Boolean(tl.selectedClipId) || Boolean(tl.selectedTextId),
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="app"
      onDragOver={(e) => {
        // Allow dropping anywhere when videos are already loaded
        if (hasVideos) e.preventDefault()
      }}
      onDrop={(e) => {
        if (!hasVideos) return
        e.preventDefault()
        void tl.addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <Header
        source={null}
        theme={preferences.value.theme}
        onPick={pickFile}
        onToggleTheme={() =>
          preferences.patch({ theme: preferences.value.theme === 'dark' ? 'light' : 'dark' })
        }
        onShortcuts={() => setDialog('shortcuts')}
        onSettings={() => setDialog('settings')}
      />

      {hasVideos ? (
        <div className="editor-shell">
          <aside className="toolrail" aria-label="Editor tools">
            <button
              type="button"
              className={`toolrail__item${!tl.selectedTextId ? ' toolrail__item--active' : ''}`}
              onClick={pickFile}
              title="Add media to timeline"
            >
              <span className="toolrail__icon">+</span>
              <span>Media</span>
            </button>
            <button
              type="button"
              className={`toolrail__item${tl.selectedTextId ? ' toolrail__item--active' : ''}`}
              onClick={() => tl.addTextSegment(playback.time)}
              title="Add independent Text Track layer"
            >
              <span className="toolrail__icon">T</span>
              <span>Text</span>
            </button>
          </aside>

          <TextPropertiesPanel
            segment={selectedText}
            onChange={tl.updateTextSegment}
            onDelete={tl.removeTextSegment}
            onClose={() => tl.setSelectedTextId(null)}
          />

          <main className="workspace">
            {tl.error && (
              <p className="banner" role="alert" onClick={tl.dismissError}>
                {tl.error}
              </p>
            )}

            <div className="workspace__intro">
              <div>
                <span className="workspace__eyebrow">Your project</span>
                <h1>Make something great</h1>
              </div>
              <button type="button" className="button button--sm" onClick={pickFile}>
                Add media
              </button>
            </div>

            <Player
              videoRef={playback.videoRef}
              time={playback.time}
              duration={playback.totalDuration}
              playing={playback.playing}
              isGap={playback.isGap}
              textSegments={tl.textSegments}
              selectedTextId={tl.selectedTextId}
              videoWidth={firstSource?.width}
              videoHeight={firstSource?.height}
              rate={playback.rate}
              muted={playback.muted}
              volume={playback.volume}
              loop={preferences.value.loopSelection}
              selection={selection ?? { start: 0, end: playback.totalDuration }}
              onToggle={playback.toggle}
              onSeek={playback.seek}
              onSelectText={tl.setSelectedTextId}
              onUpdateText={tl.updateTextSegment}
              onRate={playback.changeRate}
              onToggleMuted={playback.toggleMuted}
              onToggleLoop={() =>
                preferences.patch({ loopSelection: !preferences.value.loopSelection })
              }
              onVolume={playback.changeVolume}
            />

            <CompositeTimeline
              views={tl.views}
              sources={tl.sources}
              textSegments={tl.textSegments}
              hasTextTrack={tl.hasTextTrack}
              totalDuration={tl.totalDuration}
              time={playback.time}
              selectedClipId={tl.selectedClipId}
              selectedTextId={tl.selectedTextId}
              selection={selection}
              onSeek={playback.seek}
              onSelectClip={tl.setSelectedClipId}
              onSelectText={tl.setSelectedTextId}
              onUpdateText={tl.updateTextSegment}
              onSelectionChange={setSelection}
              onTrimSegment={tl.trimSegment}
              onMoveSegment={tl.moveSegmentTo}
              onSaveHistory={tl.saveHistory}
              onSplitAt={tl.splitAt}
              onRemoveSegment={tl.removeSegment}
            />

            <EditBar
              time={playback.time}
              totalDuration={tl.totalDuration}
              selectedClip={selectedClip}
              selection={selection}
              hasClipboard={Boolean(tl.copiedClip || tl.clipboard?.length)}
              canExportAll={tl.totalDuration >= MIN_CLIP_DURATION}
              onSplit={splitAtPlayhead}
              onCut={handleCut}
              onCopy={handleCopy}
              onPaste={handlePaste}
              onDelete={handleDelete}
              onClearSel={handleClearSelection}
              onExportAll={exportAll}
              onAddVideos={pickFile}
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
        </div>
      ) : (
        <>
          <DropZone
            onFiles={(files) => void tl.addFiles(files)}
            onPick={pickFile}
            busy={tl.busy}
            error={tl.error}
          />
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
          sourceExtension={firstSource?.extension ?? ''}
          command={previewCommand({
            start: selection?.start ?? 0,
            end: selection?.end ?? playback.totalDuration,
            settings: settings.value,
            extension: outputExtension(settings.value, firstSource?.extension ?? ''),
            sourceHeight: firstSource?.height,
          })}
        />
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        className="visually-hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) void tl.addFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
