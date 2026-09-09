// Top bar: identity on the left, the open file in the middle, tools on the right.

import type { Preferences, VideoSource } from '../types'
import { APP_NAME, REPO_URL } from '../config'
import { formatBytes } from '../lib/file'
import { formatTimecode } from '../lib/time'
import { IconGithub, IconKeyboard, IconMoon, IconSettings, IconSun } from './icons'

interface HeaderProps {
  source: VideoSource | null
  theme: Preferences['theme']
  onPick: () => void
  onToggleTheme: () => void
  onShortcuts: () => void
  onSettings: () => void
}

export function Header({
  source,
  theme,
  onPick,
  onToggleTheme,
  onShortcuts,
  onSettings,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true" />
        <span className="brand__name">{APP_NAME}</span>
      </div>

      {source ? (
        <div className="filechip">
          <span className="filechip__name" title={source.file.name}>
            {source.file.name}
          </span>
          <span className="filechip__meta">
            {source.width}×{source.height} · {formatTimecode(source.duration, false)} ·{' '}
            {formatBytes(source.size)}
          </span>
        </div>
      ) : (
        <p className="header__tagline">Trim a slice out of any video, in your browser</p>
      )}

      <div className="header__tools">
        {source ? (
          <button type="button" className="button button--sm" onClick={onPick}>
            Replace video
          </button>
        ) : null}
        <button
          type="button"
          className="iconbutton"
          onClick={onSettings}
          title="Export settings"
        >
          <IconSettings />
        </button>
        <button
          type="button"
          className="iconbutton"
          onClick={onShortcuts}
          title="Keyboard shortcuts (?)"
        >
          <IconKeyboard />
        </button>
        <button
          type="button"
          className="iconbutton"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </button>
        <a
          className="iconbutton"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
        >
          <IconGithub />
        </a>
      </div>
    </header>
  )
}
