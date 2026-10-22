// Keyboard reference, kept in sync by hand with the bindings in App.

import { IconClose } from './icons'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Playback',
    items: [
      ['Space', 'Play or pause'],
      ['← / →', 'Nudge 0.1s · Shift 1s · Alt one frame'],
      ['L', 'Loop the selection'],
      ['M', 'Mute'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Ctrl / ⌘ + Z', 'Undo'],
      ['Ctrl / ⌘ + Shift + Z', 'Redo'],
      ['S', 'Split at playhead'],
      ['Ctrl / ⌘ + X', 'Cut clip or range'],
      ['Ctrl / ⌘ + C', 'Copy clip or range'],
      ['Ctrl / ⌘ + V', 'Paste at playhead'],
      ['Delete / Backspace', 'Delete clip or range'],
      ['Esc', 'Clear the selection'],
    ],
  },
  {
    title: 'Timeline',
    items: [
      ['Click empty space', 'Move the playhead'],
      ['Shift + click', 'Move the playhead, even over a clip'],
      ['Shift + drag', 'Select a range'],
      ['Drag a clip', 'Move it'],
      ['Drag a clip edge', 'Trim it'],
      ['?', 'Open this list'],
    ],
  },
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onPointerDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__head">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="iconbutton" onClick={onClose} title="Close">
            <IconClose />
          </button>
        </header>
        <div className="dialog__body">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.items.map(([keys, description]) => (
                  <div key={keys}>
                    <dt>
                      <kbd>{keys}</kbd>
                    </dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
