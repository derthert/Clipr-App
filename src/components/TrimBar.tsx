// In/out fields and the two actions that finish the job.

import type { Selection } from '../types'
import { MIN_CLIP_DURATION } from '../lib/settings'
import { formatDuration } from '../lib/time'
import { TimeField } from './controls'
import { IconMarkIn, IconMarkOut, IconScissors, IconSkipEnd } from './icons'

interface TrimBarProps {
  selection: Selection
  duration: number
  canExport: boolean
  onChange: (selection: Selection) => void
  onMarkIn: () => void
  onMarkOut: () => void
  onReset: () => void
  onExport: () => void
  onExportNext: () => void
}

export function TrimBar({
  selection,
  duration,
  canExport,
  onChange,
  onMarkIn,
  onMarkOut,
  onReset,
  onExport,
  onExportNext,
}: TrimBarProps) {
  return (
    <section className="trimbar">
      <div className="trimbar__times">
        <div className="trimbar__slot">
          <TimeField
            label="In"
            accent="in"
            value={selection.start}
            max={duration}
            onCommit={(value) =>
              onChange({
                start: Math.min(value, selection.end - MIN_CLIP_DURATION),
                end: selection.end,
              })
            }
          />
          <button
            type="button"
            className="iconbutton iconbutton--sm"
            title="Set in point (I)"
            onClick={onMarkIn}
          >
            <IconMarkIn size={16} />
          </button>
        </div>

        <div className="trimbar__slot">
          <TimeField
            label="Out"
            accent="out"
            value={selection.end}
            max={duration}
            onCommit={(value) =>
              onChange({
                start: selection.start,
                end: Math.max(value, selection.start + MIN_CLIP_DURATION),
              })
            }
          />
          <button
            type="button"
            className="iconbutton iconbutton--sm"
            title="Set out point (O)"
            onClick={onMarkOut}
          >
            <IconMarkOut size={16} />
          </button>
        </div>

        <div className="trimbar__length">
          <span className="trimbar__length-label">Length</span>
          <strong>{formatDuration(selection.end - selection.start)}</strong>
        </div>

        <button
          type="button"
          className="button button--ghost"
          onClick={onReset}
          title="Select everything (R)"
        >
          Whole video
        </button>
      </div>

      <div className="trimbar__actions">
        <button
          type="button"
          className="button"
          onClick={onExportNext}
          disabled={!canExport}
          title="Export, then jump ahead (Q)"
        >
          <IconSkipEnd size={16} />
          Export &amp; next
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={onExport}
          disabled={!canExport}
          title="Export this clip (Ctrl+Enter)"
        >
          <IconScissors size={16} />
          Export clip
        </button>
      </div>
    </section>
  )
}
