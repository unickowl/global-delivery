import { useEffect, useState } from "react"

/**
 * useState backed by localStorage. The stored JSON is shallow-merged on top of
 * `defaultValue` so adding fields later won't break older saves. Writes happen
 * on every change.
 */
export function usePersistentState<T extends object>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return defaultValue
      const parsed = JSON.parse(raw)
      if (parsed === null || typeof parsed !== "object") return defaultValue
      return { ...defaultValue, ...(parsed as Partial<T>) }
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Quota exceeded, private mode, etc. — silently ignore.
    }
  }, [key, value])

  return [value, setValue]
}
