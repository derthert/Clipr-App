// Set once, forget: the export options live behind the gear instead of on the main screen.

import type {
  EditorProfile,
  ExportFormat,
  ExportSettings,
  QualityPreset,
  ScalePreset,
} from '../types'
import { Field, Segmented, Toggle, type Option } from './controls'
import { IconClose } from './icons'

const PROFILES: Option<EditorProfile>[] = [
  { value: 'simple', label: 'Simple' },
  { value: 'full', label: 'Full' },
]

const PROFILE_HINTS: Record<EditorProfile, string> = {
  simple: 'Split, trim and export. No text or clipboard tools.',
  full: 'Everything: text clips, cut, copy and paste.',
}

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

interface SettingsDialogProps {
  profile: EditorProfile
  onProfile: (profile: EditorProfile) => void
  settings: ExportSettings
  onChange: (patch: Partial<ExportSettings>) => void
  onReset: () => void
  onClose: () => void
  command: string
}

export function SettingsDialog({
  profile,
  onProfile,
  settings,
  onChange,
  onReset,
  onClose,
  command,
}: SettingsDialogProps) {
  // Every export re-encodes for a frame-exact cut; Lossless (stream copy) was removed
  // because it cannot handle multi-clip or text timelines.
  const visual = settings.format !== 'mp3'

  return (
    <div className="overlay" onPointerDown={onClose}>
      <div
        className="dialog dialog--settings"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__head">
          <h2>Settings</h2>
          <div className="dialog__head-tools">
            <button
              type="button"
              className="button button--ghost button--sm"
              onClick={onReset}
              title="Reset the export settings"
            >
              Reset
            </button>
            <button type="button" className="iconbutton" onClick={onClose} title="Close">
              <IconClose />
            </button>
          </div>
        </header>

        <div className="dialog__body dialog__body--form">
          <h3 className="dialog__section">Editor</h3>
          <Field label="Profile" hint={PROFILE_HINTS[profile]}>
            <Segmented label="Editor profile" value={profile} options={PROFILES} onChange={onProfile} />
          </Field>

          <h3 className="dialog__section">Export</h3>
          <Field label="Format">
            <Segmented
              label="Format"
              value={settings.format}
              options={FORMATS}
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
