// Preview surface: the video plus a compact transport row and draggable text overlay canvas.

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Selection, TextSegment } from '../types'
import { clamp, formatTimecode } from '../lib/time'
import {
  IconLoop,
  IconMute,
  IconPause,
  IconPlay,
  IconSkipEnd,
  IconSkipStart,
  IconVolume,
} from './icons'

const RATES = [0.25, 0.5, 1, 1.5, 2]
/** Reference preview height used so fontSize scales identically between preview and export. */
export const PREVIEW_REF_HEIGHT = 360

interface PlayerProps {
  url?: string
  videoRef: RefObject<HTMLVideoElement>
  time: number
  duration: number
  playing: boolean
  isGap?: boolean
  textSegments?: TextSegment[]
  selectedTextId?: string | null
  videoWidth?: number
  videoHeight?: number
  rate: number
  muted: boolean
  volume: number
  loop: boolean
  selection: Selection
  onToggle: () => void
  onSeek: (time: number) => void
  onSelectText?: (id: string | null) => void
  onUpdateText?: (id: string, patch: Partial<TextSegment>) => void
  onRate: (rate: number) => void
  onToggleMuted: () => void
  onToggleLoop: () => void
  onVolume: (v: number) => void
}

type ResizeHandleDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

const RESIZE_HANDLES: ResizeHandleDir[] = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']

interface TextDragState {
  mode: 'move' | 'resize'
  id: string
  pointerId: number
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startFontSize: number
  centerX: number
  centerY: number
  startDist: number
  handle?: ResizeHandleDir
}

export function Player({
  url,
  videoRef,
  time,
  duration,
  playing,
  isGap = false,
  textSegments = [],
  selectedTextId = null,
  videoWidth = 1280,
  videoHeight = 720,
  rate,
  muted,
  volume,
  loop,
  selection,
  onToggle,
  onSeek,
  onSelectText,
  onUpdateText,
  onRate,
  onToggleMuted,
  onToggleLoop,
  onVolume,
}: PlayerProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<TextDragState | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setStageSize({ width: rect.width, height: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const activeTexts = textSegments.filter(
    (seg) => time >= seg.timelineStart - 0.01 && time <= seg.timelineStart + seg.duration + 0.01,
  )

  // Compute exact rendered video frame box inside .player__stage (matching object-fit: contain)
  const vidW = videoRef.current?.videoWidth || videoWidth || 1280
  const vidH = videoRef.current?.videoHeight || videoHeight || 720
  const videoAspect = vidW > 0 && vidH > 0 ? vidW / vidH : 16 / 9

  let boxLeft = 0
  let boxTop = 0
  let boxW = stageSize.width
  let boxH = stageSize.height

  if (stageSize.width > 0 && stageSize.height > 0) {
    const stageAspect = stageSize.width / stageSize.height
    if (stageAspect > videoAspect) {
      boxH = stageSize.height
      boxW = boxH * videoAspect
      boxLeft = (stageSize.width - boxW) / 2
      boxTop = 0
    } else {
      boxW = stageSize.width
      boxH = boxW / videoAspect
      boxLeft = 0
      boxTop = (stageSize.height - boxH) / 2
    }
  }

  const fontScale = boxH > 0 ? boxH / PREVIEW_REF_HEIGHT : 1

  return (
    <section className="player">
      <div ref={stageRef} className="player__stage" onClick={onToggle}>
        {/* url is managed externally by useSegmentPlayback when undefined */}
        <video
          ref={videoRef}
          {...(url ? { src: url } : {})}
          style={{ opacity: isGap ? 0 : 1 }}
          playsInline
          preload="auto"
        />
        {activeTexts.length > 0 && (
          <div
            ref={textLayerRef}
            className="player__text-layer"
            style={
              boxW > 0 && boxH > 0
                ? {
                    left: `${boxLeft}px`,
                    top: `${boxTop}px`,
                    width: `${boxW}px`,
                    height: `${boxH}px`,
                    right: 'auto',
                    bottom: 'auto',
                  }
                : undefined
            }
          >
            {activeTexts.map((seg) => {
              const isSelected = seg.id === selectedTextId
              const isDragging = seg.id === draggingId
              const xPct = Number.isFinite(seg.x) ? seg.x : 50
              const yPct = Number.isFinite(seg.y) ? seg.y : 50
              const lines = seg.text.split(/\r?\n/)

              const startResize = (e: React.PointerEvent<HTMLSpanElement>, handle: ResizeHandleDir) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                onSelectText?.(seg.id)

                const itemEl = e.currentTarget.parentElement
                const itemRect = itemEl?.getBoundingClientRect()
                const centerX = itemRect ? itemRect.left + itemRect.width / 2 : e.clientX
                const centerY = itemRect ? itemRect.top + itemRect.height / 2 : e.clientY

                const measureDist = (clientX: number, clientY: number) => {
                  if (handle === 'e' || handle === 'w') {
                    return Math.max(12, Math.abs(clientX - centerX))
                  }
                  if (handle === 'n' || handle === 's') {
                    return Math.max(10, Math.abs(clientY - centerY))
                  }
                  return Math.max(14, Math.hypot(clientX - centerX, clientY - centerY))
                }

                if (itemEl) {
                  itemEl.setPointerCapture(e.pointerId)
                }

                dragRef.current = {
                  mode: 'resize',
                  id: seg.id,
                  pointerId: e.pointerId,
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startX: xPct,
                  startY: yPct,
                  startFontSize: seg.fontSize,
                  centerX,
                  centerY,
                  startDist: measureDist(e.clientX, e.clientY),
                  handle,
                }
                setDraggingId(seg.id)
              }

              return (
                <div
                  key={seg.id}
                  className={`player__text-item${isSelected ? ' player__text-item--selected' : ''}${isDragging ? ' player__text-item--dragging' : ''}`}
                  data-selected={isSelected ? 'true' : 'false'}
                  data-dragging={isDragging ? 'true' : 'false'}
                  style={{
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    fontFamily: seg.fontFamily,
                    fontSize: `${Math.max(10, Math.round(seg.fontSize * fontScale * 10) / 10)}px`,
                    color: seg.color,
                  }}
                  title="Drag to move · Drag corners/edges to scale text size"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectText?.(seg.id)
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    e.preventDefault()
                    onSelectText?.(seg.id)
                    e.currentTarget.setPointerCapture(e.pointerId)
                    dragRef.current = {
                      mode: 'move',
                      id: seg.id,
                      pointerId: e.pointerId,
                      startClientX: e.clientX,
                      startClientY: e.clientY,
                      startX: xPct,
                      startY: yPct,
                      startFontSize: seg.fontSize,
                      centerX: 0,
                      centerY: 0,
                      startDist: 1,
                    }
                    setDraggingId(seg.id)
                  }}
                  onPointerMove={(e) => {
                    const drag = dragRef.current
                    if (!drag || drag.id !== seg.id) return
                    e.stopPropagation()

                    if (drag.mode === 'resize') {
                      let currDist: number
                      if (drag.handle === 'e' || drag.handle === 'w') {
                        currDist = Math.max(6, Math.abs(e.clientX - drag.centerX))
                      } else if (drag.handle === 'n' || drag.handle === 's') {
                        currDist = Math.max(6, Math.abs(e.clientY - drag.centerY))
                      } else {
                        currDist = Math.max(6, Math.hypot(e.clientX - drag.centerX, e.clientY - drag.centerY))
                      }
                      const ratio = currDist / Math.max(1, drag.startDist)
                      const nextFontSize = Math.round(clamp(drag.startFontSize * ratio, 10, 200))
                      onUpdateText?.(seg.id, { fontSize: nextFontSize })
                      return
                    }

                    const layerEl = textLayerRef.current ?? stageRef.current
                    if (!layerEl) return
                    const rect = layerEl.getBoundingClientRect()
                    if (rect.width <= 0 || rect.height <= 0) return

                    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100
                    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100
                    const nextX = Math.round(clamp(drag.startX + dxPct, 2, 98) * 10) / 10
                    const nextY = Math.round(clamp(drag.startY + dyPct, 2, 98) * 10) / 10
                    onUpdateText?.(seg.id, { x: nextX, y: nextY })
                  }}
                  onPointerUp={(e) => {
                    if (dragRef.current?.id !== seg.id) return
                    e.stopPropagation()
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    }
                    dragRef.current = null
                    setDraggingId(null)
                  }}
                  onPointerCancel={(e) => {
                    if (dragRef.current?.id !== seg.id) return
                    e.stopPropagation()
                    dragRef.current = null
                    setDraggingId(null)
                  }}
                >
                  {lines.map((line, idx) => (
                    <span key={idx} className="player__text-line">
                      {line || '\u00A0'}
                    </span>
                  ))}
                  {RESIZE_HANDLES.map((dir) => (
                    <span
                      key={dir}
                      className={`player__text-handle player__text-handle--${dir}`}
                      data-dir={dir}
                      onPointerDown={(e) => startResize(e, dir)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="player__transport">
        <div className="player__group">
          <button
            type="button"
            className="iconbutton"
            title="Go to in point"
            onClick={() => onSeek(selection.start)}
          >
            <IconSkipStart />
          </button>
          <button
            type="button"
            className="iconbutton iconbutton--primary"
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            onClick={onToggle}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <button
            type="button"
            className="iconbutton"
            title="Go to out point"
            onClick={() => onSeek(selection.end)}
          >
            <IconSkipEnd />
          </button>
        </div>

        <p className="player__time">
          <strong>{formatTimecode(time)}</strong>
          <span>/ {formatTimecode(duration)}</span>
        </p>

        <div className="player__group">
          <button
            type="button"
            className="iconbutton"
            data-active={loop}
            title="Loop selection (L)"
            onClick={onToggleLoop}
          >
            <IconLoop />
          </button>
          <label className="select">
            <span className="visually-hidden">Playback speed</span>
            <select value={rate} onChange={(event) => onRate(Number(event.target.value))}>
              {RATES.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="iconbutton"
            data-active={muted}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
            onClick={onToggleMuted}
          >
            {muted ? <IconMute /> : <IconVolume />}
          </button>
          <input
            type="range"
            className="player__volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            title={`Volume: ${Math.round((muted ? 0 : volume) * 100)}%`}
            onChange={(e) => onVolume(Number(e.target.value))}
          />
        </div>
      </div>
    </section>
  )
}
