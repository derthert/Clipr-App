// Settings that survive a reload, merged with defaults so new options appear on upgrade.

import { useCallback, useEffect, useState } from 'react'

export function usePersistentState<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key)
      return stored ? { ...fallback, ...(JSON.parse(stored) as Partial<T>) } : fallback
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage can be disabled, the app still works for this session.
    }
  }, [key, value])

  const patch = useCallback((changes: Partial<T>) => {
    setValue((current) => ({ ...current, ...changes }))
  }, [])

  const reset = useCallback(() => setValue(fallback), [fallback])

  return { value, patch, reset, setValue }
}
