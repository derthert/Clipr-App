// Keyboard-first editing: every binding is declared once and stays out of text fields.

import { useEffect, useRef } from 'react'

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>

function comboOf(event: KeyboardEvent): string {
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('mod')
  if (event.altKey) parts.push('alt')
  if (event.shiftKey) parts.push('shift')
  parts.push(event.key === ' ' ? 'space' : event.key.toLowerCase())
  return parts.join('+')
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  )
}

export function useHotkeys(bindings: HotkeyMap, enabled = true): void {
  const ref = useRef(bindings)
  ref.current = bindings

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const combo = comboOf(event)
      if (isTyping(event.target) && !combo.startsWith('mod') && combo !== 'escape') return
      const handler = ref.current[combo]
      if (!handler) return
      event.preventDefault()
      handler(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
