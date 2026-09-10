// Reusable form primitives: segmented picker, switch and timecode input.

import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatTimecode, parseTimecode } from '../lib/time'

export interface Option<T extends string> {
  value: T
  label: string
  title?: string
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} data-disabled={disabled}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className="segmented__item"
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface FieldProps {
  label: string
  hint?: ReactNode
  children: ReactNode
  wide?: boolean
}

export function Field({ label, hint, children, wide }: FieldProps) {
  return (
    <div className="field" data-wide={wide}>
      <div className="field__head">
        <span className="field__label">{label}</span>
      </div>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  )
}

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle">
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint ? <span className="toggle__hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="toggle__switch"
        onClick={() => onChange(!checked)}
      >
        <span className="toggle__thumb" />
      </button>
    </label>
  )
}

interface TimeFieldProps {
  label: string
  value: number
  max: number
  onCommit: (value: number) => void
  accent?: 'in' | 'out'
}

export function TimeField({ label, value, max, onCommit, accent }: TimeFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState(() => formatTimecode(value))
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(formatTimecode(value))
  }, [value, editing])

  const commit = (text: string) => {
    const parsed = parseTimecode(text)
    if (parsed === null) {
      setDraft(formatTimecode(value))
      return
    }
    onCommit(Math.min(max, Math.max(0, parsed)))
  }

  return (
    <div className="timefield" data-accent={accent}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={draft}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(event) => {
          setEditing(true)
          event.target.select()
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          setEditing(false)
          commit(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
            return
          }
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          event.preventDefault()
          const step = event.shiftKey ? 1 : 0.1
          const next = value + (event.key === 'ArrowUp' ? step : -step)
          onCommit(Math.min(max, Math.max(0, next)))
        }}
      />
    </div>
  )
}
