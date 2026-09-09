// Keyboard reference, kept in sync by hand with the bindings in App.

import { IconClose } from './icons'

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Playback',
    items: [
      ['Space', 'Play or pause'],
      ['← / →', 'Nudge 0.1s · Shift 1s · Alt one frame'],
      ['Home / End', 'Jump to the in or out point'],
      ['L', 'Loop the selection'],
      ['M', 'Mute'],
    ],
  },
  {
    title: 'Trimming',
    items: [
      ['I', 'Set the in point at the playhead'],
      ['O', 'Set the out point at the playhead'],
      ['R', 'Select the whole video'],
      ['Click the timeline', 'Move the playhead, anywhere on the bar'],
      ['Shift + drag', 'Slide the whole selection along'],
    ],
  },
  {
    title: 'Exporting',
    items: [
      ['Ctrl / ⌘ + Enter', 'Export the current clip'],
      ['Q', 'Export, then jump to the next segment'],
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
