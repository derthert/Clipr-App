// Slide-in Properties Panel for editing a selected Text Track clip (font-family, font-size, text, color).

import type { TextSegment } from '../types'
import { IconClose, IconTrash } from './icons'

export const FONT_FAMILY_OPTIONS = [
  { label: 'Inter (Sans-Serif)', value: 'Inter' },
  { label: 'Space Grotesk', value: 'Space Grotesk' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Verdana', value: 'Verdana' },
  { label: 'Georgia (Serif)', value: 'Georgia' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Courier New (Mono)', value: 'Courier New' },
  { label: 'Impact (Display)', value: 'Impact' },
]

const COLOR_SWATCHES = ['#ffffff', '#f6c445', '#38bdf8', '#22c55e', '#f97316', '#ec4899', '#ff6b81']

interface TextPropertiesPanelProps {
  segment: TextSegment | null
  onChange: (id: string, patch: Partial<TextSegment>) => void
  onDelete: (id: string) => void
  onClose: () => void
}

export function TextPropertiesPanel({
  segment,
  onChange,
  onDelete,
  onClose,
}: TextPropertiesPanelProps) {
  const isOpen = Boolean(segment)

  return (
    <aside
      className="text-props-panel"
      data-open={isOpen ? 'true' : 'false'}
      aria-label="Text properties"
      aria-hidden={!isOpen}
    >
      <div className="text-props-panel__inner">
        <div className="text-props-panel__head">
          <span className="text-props-panel__title">Text Properties</span>
          <button
            type="button"
            className="iconbutton iconbutton--sm"
            onClick={onClose}
            title="Close panel"
          >
            <IconClose size={14} />
          </button>
        </div>

        {segment && (
          <div className="text-props-panel__body">
            {/* Text content */}
            <div className="field">
              <label className="field__label" htmlFor="text-clip-content">
                Content
              </label>
              <textarea
                id="text-clip-content"
                className="input text-props-panel__textarea"
                rows={2}
                value={segment.text}
                placeholder="Enter text…"
                onChange={(e) => onChange(segment.id, { text: e.target.value })}
              />
            </div>

            {/* Font Family */}
            <div className="field">
              <label className="field__label" htmlFor="text-clip-font-family">
                Font Family
              </label>
              <select
                id="text-clip-font-family"
                className="input text-props-panel__select"
                value={segment.fontFamily}
                onChange={(e) => onChange(segment.id, { fontFamily: e.target.value })}
                style={{ fontFamily: segment.fontFamily }}
              >
                {FONT_FAMILY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ fontFamily: opt.value }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div className="field">
              <div className="text-props-panel__row">
                <label className="field__label" htmlFor="text-clip-font-size">
                  Font Size
                </label>
                <span className="text-props-panel__badge">{segment.fontSize}px</span>
              </div>
              <div className="text-props-panel__size-controls">
                <input
                  id="text-clip-font-size"
                  type="range"
                  className="player__volume text-props-panel__slider"
                  min={14}
                  max={120}
                  step={1}
                  value={segment.fontSize}
                  onChange={(e) => onChange(segment.id, { fontSize: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className="input text-props-panel__num"
                  min={10}
                  max={200}
                  value={segment.fontSize}
                  onChange={(e) => {
                    const val = Math.max(10, Math.min(200, Number(e.target.value) || 14))
                    onChange(segment.id, { fontSize: val })
                  }}
                />
              </div>
            </div>

            {/* Text Color */}
            <div className="field">
              <label className="field__label" htmlFor="text-clip-color">
                Color
              </label>
              <div className="text-props-panel__swatches">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className="text-props-panel__swatch"
                    data-active={segment.color.toLowerCase() === swatch}
                    style={{ background: swatch }}
                    onClick={() => onChange(segment.id, { color: swatch })}
                    title={swatch}
                  />
                ))}
                <input
                  id="text-clip-color"
                  type="color"
                  className="text-props-panel__color-input"
                  value={segment.color}
                  onChange={(e) => onChange(segment.id, { color: e.target.value })}
                  title="Custom color"
                />
              </div>
            </div>

            {/* Position (X / Y coordinates on video canvas) */}
            <div className="field">
              <div className="text-props-panel__row">
                <label className="field__label">Position (X / Y)</label>
                <button
                  type="button"
                  className="text-props-panel__reset-pos"
                  onClick={() => onChange(segment.id, { x: 50, y: 50 })}
                  title="Reset text to center of video"
                >
                  Center
                </button>
              </div>
              <div className="text-props-panel__pos-grid">
                <label className="text-props-panel__pos-field">
                  <span>X (%)</span>
                  <input
                    type="number"
                    className="input text-props-panel__num"
                    min={2}
                    max={98}
                    step={1}
                    value={Math.round(segment.x)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(98, Number(e.target.value) || 50))
                      onChange(segment.id, { x: val })
                    }}
                  />
                </label>
                <label className="text-props-panel__pos-field">
                  <span>Y (%)</span>
                  <input
                    type="number"
                    className="input text-props-panel__num"
                    min={2}
                    max={98}
                    step={1}
                    value={Math.round(segment.y)}
                    onChange={(e) => {
                      const val = Math.max(2, Math.min(98, Number(e.target.value) || 50))
                      onChange(segment.id, { y: val })
                    }}
                  />
                </label>
              </div>
              <span className="field__hint">
                Drag the text directly on the video preview to move it.
              </span>
            </div>

            <button
              type="button"
              className="button button--sm editbar__btn editbar__btn--danger text-props-panel__delete"
              onClick={() => onDelete(segment.id)}
            >
              <IconTrash size={14} />
              Delete Text Clip
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

