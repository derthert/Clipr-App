// Set once, forget: the export options live behind the gear instead of on the main screen.

import type { ExportFormat, ExportSettings, QualityPreset, ScalePreset, TrimMode } from '../types'
import { Field, Segmented, Toggle, type Option } from './controls'
import { IconClose } from './icons'

const MODES: Option<TrimMode>[] = [
  { value: 'precise', label: 'Exact' },
  { value: 'copy', label: 'Lossless' },
]

const FORMATS: Option<ExportFormat>[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'gif', label: 'GIF' },
  { value: 'mp3', label: 'MP3' },
]

const QUALITIES: Option<QualityPreset>[] = [
  { value: 'high', label: 'High' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'small', label: 'Small' },
]

const SIZES: Option<ScalePreset>[] = [
  { value: 'source', label: 'Original' },
  { value: '1080', label: '1080p' },
  { value: '720', label: '720p' },
  { value: '480', label: '480p' },
]

const MODE_HINTS: Record<TrimMode, string> = {
  precise: 'Exactly the range you picked.',
  copy: 'Instant, but the start snaps to the nearest keyframe.',
}

interface SettingsDialogProps {
  settings: ExportSettings
  onChange: (patch: Partial<ExportSettings>) => void
  onReset: () => void
  onClose: () => void
  sourceExtension: string
  command: string
}

export function SettingsDialog({
  settings,
  onChange,
  onReset,
  onClose,
  sourceExtension,
  command,
}: SettingsDialogProps) {
  const encoding = settings.mode === 'precise'
  const visual = encoding && settings.format !== 'mp3'

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div
        className="dialog dialog--settings"
        role="dialog"
        aria-modal="true"
        aria-label="Export settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__head">
          <h2>Export settings</h2>
          <div className="dialog__head-tools">
            <button type="button" className="button button--ghost button--sm" onClick={onReset}>
              Reset
            </button>
            <button type="button" className="iconbutton" onClick={onClose} title="Close">
              <IconClose />
            </button>
          </div>
        </header>

        <div className="dialog__body dialog__body--form">
          <Field label="Cut" hint={MODE_HINTS[settings.mode]}>
            <Segmented
              label="Cut mode"
              value={settings.mode}
              options={MODES}
              onChange={(mode) => onChange({ mode })}
            />
          </Field>

          <Field
            label="Format"
            hint={encoding ? undefined : `Keeps the original${sourceExtension ? ` .${sourceExtension}` : ' format'}`}
          >
            <Segmented
              label="Format"
              value={settings.format}
              options={FORMATS}
              disabled={!encoding}
              onChange={(format) => onChange({ format })}
            />
          </Field>

          {visual ? (
            <>
              <Field label="Quality">
                <Segmented
                  label="Quality"
                  value={settings.quality}
                  options={QUALITIES}
                  onChange={(quality) => onChange({ quality })}
                />
              </Field>

              <Field label="Size">
                <Segmented
                  label="Size"
                  value={settings.scale}
                  options={SIZES}
                  onChange={(scale) => onChange({ scale })}
                />
              </Field>
            </>
          ) : null}

          {settings.format !== 'gif' ? (
            <Toggle
              label="Mute audio"
              checked={settings.muteAudio}
              onChange={(muteAudio) => onChange({ muteAudio })}
            />
          ) : null}

          <details className="disclosure">
            <summary>ffmpeg command</summary>
            <pre>{command}</pre>
          </details>
        </div>
      </div>
    </div>
  )
}
