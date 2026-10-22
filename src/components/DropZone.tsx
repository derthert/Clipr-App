// Empty state: the whole surface is a drop target for the first video(s).

import { useState } from 'react'
import { isDesktop } from '../lib/desktop'
import { isVideoFile } from '../lib/file'
import { IconAlert, IconUpload } from './icons'

interface DropZoneProps {
  onFiles: (files: File[]) => void
  onPick: () => void
  busy: boolean
  error: string | null
}

export function DropZone({ onFiles, onPick, busy, error }: DropZoneProps) {
  const [hovering, setHovering] = useState(false)

  return (
    <div
      className="dropzone"
      data-hovering={hovering}
      onDragOver={(event) => {
        event.preventDefault()
        setHovering(true)
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={(event) => {
        event.preventDefault()
        setHovering(false)
        const files = Array.from(event.dataTransfer.files).filter(isVideoFile)
        if (files.length > 0) onFiles(files)
      }}
    >
      <div className="dropzone__card">
        <div className="dropzone__icon">
          <IconUpload size={26} />
        </div>
        <h1>Drop videos here</h1>
        <p className="dropzone__lead">
          Add one or more videos, pick in/out points, then merge & export.
          Nothing leaves{isDesktop ? ' this machine' : ' this tab'}.
        </p>
        <button type="button" className="button button--primary button--lg" onClick={onPick}>
          {busy ? 'Reading file…' : 'Choose videos'}
        </button>
        <ul className="dropzone__facts">
          <li>MP4, WebM, MOV, MKV</li>
          <li>Multiple videos</li>
          <li>Merge & export</li>
        </ul>
        {error ? (
          <p className="dropzone__error" role="alert">
            <IconAlert size={16} />
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
