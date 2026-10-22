// Edit toolbar: split, cut, copy, paste, delete + timecodes + export buttons.

import type { SegmentView, Selection } from '../types'
import { formatTimecode, formatDuration } from '../lib/time'
import {
  IconScissors,
  IconClose,
  IconPlus,
} from './icons'

interface EditBarProps {
  time: number
  totalDuration: number
  selectedClip: SegmentView | null
  selection: Selection | null
  hasClipboard: boolean
  canExportAll: boolean
  onSplit: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onClearSel: () => void
  onExportAll: () => void
  onAddVideos: () => void
  /** Cut / Copy / Paste buttons; hidden in the Simple editor profile. */
  showClipboard: boolean
}

// Split icon
function IconSplit({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d="M12 3v18" />
      <path d="M3 9h6M15 9h6M3 15h6M15 15h6" />
    </svg>
  )
}

// Copy icon
function IconCopy({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

// Cut icon
function IconCut({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="6" cy="6" r="2.5" />
      <path d="M8.1 7.6L20 18M8.1 16.4L14 11" />
      <path d="M20 6l-5 5" />
    </svg>
  )
}

// Paste icon
function IconPaste({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z" />
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  )
}

// Trash/delete icon
function IconTrash2({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
    >
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5L7.4 20h9.2l.9-13.5" />
      <path d="M10 11v5M14 11v5" />
    </svg>
  )
}

export function EditBar({
  time,
  totalDuration,
  selectedClip,
  selection,
  hasClipboard,
  canExportAll,
  onSplit,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onClearSel,
  onExportAll,
  onAddVideos,
  showClipboard,
}: EditBarProps) {
  const hasRangeSel = Boolean(selection && selection.end - selection.start > 0.04)
  const canEditClipOrSel = Boolean(selectedClip) || hasRangeSel
  const activeRange = selectedClip
    ? { start: selectedClip.timelineStart, end: selectedClip.timelineStart + selectedClip.timelineDuration }
    : hasRangeSel && selection
      ? selection
      : null

  return (
    <section className="editbar">
      {/* Left: edit operations */}
      <div className="editbar__ops">
        <button
          type="button"
          className="button button--sm editbar__btn"
          onClick={onSplit}
          title="Split at playhead (S)"
        >
          <IconSplit size={15} />
          Split
        </button>
        <div className="editbar__divider" />
        {showClipboard ? (
          <>
        <button
          type="button"
          className="button button--sm editbar__btn"
          onClick={onCut}
          disabled={!canEditClipOrSel}
          title="Cut selected clip (Ctrl+X)"
        >
          <IconCut size={15} />
          Cut
        </button>
        <button
          type="button"
          className="button button--sm editbar__btn"
          onClick={onCopy}
          disabled={!canEditClipOrSel}
          title="Copy selected clip (Ctrl+C)"
        >
          <IconCopy size={15} />
          Copy
        </button>
        <button
          type="button"
          className="button button--sm editbar__btn"
          onClick={onPaste}
          disabled={!hasClipboard}
          title="Paste at playhead (Ctrl+V)"
        >
          <IconPaste size={15} />
          Paste
        </button>
          </>
        ) : null}
        <button
          type="button"
          className="button button--sm editbar__btn editbar__btn--danger"
          onClick={onDelete}
          disabled={!canEditClipOrSel}
          title="Delete selected clip (Delete / Backspace)"
        >
          <IconTrash2 size={15} />
          Delete
        </button>
        {canEditClipOrSel && (
          <button
            type="button"
            className="iconbutton iconbutton--sm"
            onClick={onClearSel}
            title="Clear selection (Esc)"
          >
            <IconClose size={13} />
          </button>
        )}
      </div>

      {/* Center: timecodes */}
      <div className="editbar__times">
        {activeRange ? (
          <>
            <span className="editbar__tc editbar__tc--in">
              <span className="editbar__tc-label">IN</span>
              {formatTimecode(activeRange.start)}
            </span>
            <span className="editbar__tc-dur">
              {formatDuration(activeRange.end - activeRange.start)}
            </span>
            <span className="editbar__tc editbar__tc--out">
              <span className="editbar__tc-label">OUT</span>
              {formatTimecode(activeRange.end)}
            </span>
          </>
        ) : (
          <span className="editbar__tc">
            <span className="editbar__tc-label">TIME</span>
            {formatTimecode(time)}
            <span className="editbar__tc-total"> / {formatTimecode(totalDuration)}</span>
          </span>
        )}
      </div>

      {/* Right: import + export */}
      <div className="editbar__actions">
        <button
          type="button"
          className="button button--sm"
          onClick={onAddVideos}
          title="Add more videos"
        >
          <IconPlus size={15} />
          Add videos
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={onExportAll}
          disabled={!canExportAll}
          title="Export merged timeline composition"
        >
          <IconScissors size={15} />
          Export
        </button>
      </div>
    </section>
  )
}
