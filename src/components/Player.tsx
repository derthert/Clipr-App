// Preview surface: the video plus a compact transport row.

import type { RefObject } from 'react'
import type { Selection } from '../types'
import { formatTimecode } from '../lib/time'
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

interface PlayerProps {
  url: string
  videoRef: RefObject<HTMLVideoElement>
  time: number
  duration: number
  playing: boolean
  rate: number
  muted: boolean
  loop: boolean
  selection: Selection
  onToggle: () => void
  onSeek: (time: number) => void
  onRate: (rate: number) => void
  onToggleMuted: () => void
  onToggleLoop: () => void
}

export function Player({
  url,
  videoRef,
  time,
  duration,
  playing,
  rate,
  muted,
  loop,
  selection,
  onToggle,
  onSeek,
  onRate,
  onToggleMuted,
  onToggleLoop,
}: PlayerProps) {
  return (
    <section className="player">
      <div className="player__stage">
        <video ref={videoRef} src={url} onClick={onToggle} playsInline preload="auto" />
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
        </div>
      </div>
    </section>
  )
}
