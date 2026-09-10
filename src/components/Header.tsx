// Top bar. On the desktop it is also the window title bar, so it carries the window controls.

import type { Preferences, VideoSource } from '../types'
import { APP_NAME, REPO_URL } from '../config'
import { isDesktop } from '../lib/desktop'
import { formatBytes } from '../lib/file'
import { formatTimecode } from '../lib/time'
import { BrandMark, IconGithub, IconKeyboard, IconMoon, IconSettings, IconSun } from './icons'
import { WindowControls } from './WindowControls'

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
    <header className="header" data-desktop={isDesktop}>
      <div className="brand">
        <BrandMark />
        <span className="brand__name">{APP_NAME}</span>
      </div>

      {source ? (
        <div className="filechip" title={source.path ?? source.file.name}>
          <span className="filechip__name">{source.file.name}</span>
          <span className="filechip__meta">
            <span>{formatTimecode(source.duration, false)}</span>
            <span>
              {source.width}×{source.height}
            </span>
            <span>{formatBytes(source.size)}</span>
          </span>
        </div>
      ) : (
        <p className="header__tagline">Trim a slice out of any video</p>
      )}

      <div className="header__tools">
        {source ? (
          <button type="button" className="button button--sm" onClick={onPick}>
            Replace video
          </button>
        ) : null}
        <button type="button" className="iconbutton" onClick={onSettings} title="Export settings">
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

      <WindowControls />
    </header>
  )
}
