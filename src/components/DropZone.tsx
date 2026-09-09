// Empty state: the whole surface is a drop target for the first video.

import { useState } from 'react'
import { IconAlert, IconUpload } from './icons'

interface DropZoneProps {
  onFile: (file: File) => void
  onPick: () => void
  busy: boolean
  error: string | null
}

export function DropZone({ onFile, onPick, busy, error }: DropZoneProps) {
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
        const file = event.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <div className="dropzone__card">
        <div className="dropzone__icon">
          <IconUpload size={26} />
        </div>
        <h1>Drop a video here</h1>
        <p className="dropzone__lead">
          Pick a start and an end, export the slice. Everything runs in this tab, nothing is
          uploaded anywhere.
        </p>
        <button type="button" className="button button--primary button--lg" onClick={onPick}>
          {busy ? 'Reading file…' : 'Choose a video'}
        </button>
        <ul className="dropzone__facts">
          <li>MP4, WebM, MOV, MKV</li>
          <li>Lossless cut or re-encode</li>
          <li>Queue many clips at once</li>
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
