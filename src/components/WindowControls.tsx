// Minimise and close, drawn by us because the desktop window has no native title bar.

import { desktop } from '../lib/desktop'

const Glyph = ({ d }: { d: string }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
)

export function WindowControls() {
  const bridge = desktop
  if (!bridge) return null

  return (
    <div className="wincontrols">
      <button type="button" title="Minimise" onClick={() => void bridge.minimize()}>
        <Glyph d="M0.5 5.5h9" />
      </button>
      <button
        type="button"
        className="wincontrols__close"
        title="Close"
        onClick={() => void bridge.close()}
      >
        <Glyph d="M0.7 0.7l8.6 8.6M9.3 0.7l-8.6 8.6" />
      </button>
    </div>
  )
}
