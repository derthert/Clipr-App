// Left sidebar: lists all loaded videos, lets the user switch between them and add more.

import { useRef, useState } from 'react'
import type { VideoItem } from '../types'
import { formatBytes } from '../lib/file'
import { formatTimecode } from '../lib/time'
import { isVideoFile } from '../lib/file'
import { VIDEO_ACCEPT } from '../lib/file'
import { IconClose, IconFilm, IconPlus, IconUpload } from './icons'

interface VideoLibraryProps {
  items: VideoItem[]
  activeId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onAddFiles: (files: File[]) => void
  onReorder: (from: number, to: number) => void
}

export function VideoLibrary({
  items,
  activeId,
  busy,
  onSelect,
  onRemove,
  onAddFiles,
  onReorder,
}: VideoLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draggingOver, setDraggingOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const pickFiles = () => fileInputRef.current?.click()

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDraggingOver(false)

    // If this is an internal reorder drop, ignore file handling
    if (dragIndex !== null) return

    const files = Array.from(event.dataTransfer.files)
    const videoFiles = files.filter(isVideoFile)
    if (videoFiles.length > 0) onAddFiles(videoFiles)
  }

  // --- Item drag-to-reorder ---
  const onItemDragStart = (index: number, event: React.DragEvent) => {
    setDragIndex(index)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onItemDragOver = (index: number, event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }

  const onItemDrop = (index: number, event: React.DragEvent) => {
    event.preventDefault()
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index)
    }
    setDragIndex(null)
    setDropIndex(null)
  }

  const onItemDragEnd = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <aside
      className="videolibrary"
      data-hovering={draggingOver}
      onDragOver={(e) => {
        // Only show drop highlight when dragging files from outside, not item reordering
        if (dragIndex === null) {
          e.preventDefault()
          setDraggingOver(true)
        }
      }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={handleDrop}
    >
      <div className="videolibrary__head">
        <span className="videolibrary__title">
          <IconFilm size={14} />
          Media
          {items.length > 0 && (
            <span className="videolibrary__count">{items.length}</span>
          )}
        </span>
        <button
          type="button"
          className="iconbutton iconbutton--sm"
          onClick={pickFiles}
          disabled={busy}
          title="Add more videos"
        >
          <IconPlus size={16} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="videolibrary__empty">
          <IconUpload size={24} />
          <p>Drop videos here</p>
        </div>
      ) : (
        <ul className="videolibrary__list">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="videolibrary__item"
              data-active={item.id === activeId}
              data-dragging={dragIndex === index}
              data-dropover={dropIndex === index && dragIndex !== index}
              draggable
              onDragStart={(e) => onItemDragStart(index, e)}
              onDragOver={(e) => onItemDragOver(index, e)}
              onDrop={(e) => onItemDrop(index, e)}
              onDragEnd={onItemDragEnd}
              onClick={() => onSelect(item.id)}
            >
              <VideoThumbnail url={item.source.url} />
              <div className="videolibrary__info">
                <span className="videolibrary__name" title={item.source.file.name}>
                  {item.source.file.name}
                </span>
                <span className="videolibrary__meta">
                  <span>{formatTimecode(item.source.duration, false)}</span>
                  <span>{formatBytes(item.source.size)}</span>
                </span>
                <span className="videolibrary__trim">
                  {formatTimecode(item.selection.start, false)} →{' '}
                  {formatTimecode(item.selection.end, false)}
                </span>
              </div>
              <button
                type="button"
                className="iconbutton iconbutton--sm videolibrary__remove"
                title="Remove"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(item.id)
                }}
              >
                <IconClose size={13} />
              </button>
              {/* Order badge */}
              <span className="videolibrary__order">{index + 1}</span>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        className="visually-hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) onAddFiles(files)
          event.target.value = ''
        }}
      />
    </aside>
  )
}

// A lightweight thumbnail canvas drawn from a video element
function VideoThumbnail({ url }: { url: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawnRef = useRef(false)

  const onVideoLoad = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (drawnRef.current) return
    const video = event.currentTarget
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = 80
    canvas.height = 45
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(video, 0, 0, 80, 45)
      drawnRef.current = true
    }
  }

  return (
    <div className="videolibrary__thumb">
      <video
        src={url}
        muted
        preload="metadata"
        className="visually-hidden"
        onLoadedData={onVideoLoad}
      />
      <canvas ref={canvasRef} className="videolibrary__canvas" />
    </div>
  )
}
