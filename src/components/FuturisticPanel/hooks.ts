import { useEffect, useRef, useState } from "react"

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const box = entry.borderBoxSize?.[0]
      const w = box ? box.inlineSize : entry.contentRect.width
      const h = box ? box.blockSize : entry.contentRect.height
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
    })

    observer.observe(el, { box: "border-box" })
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

export function useHover<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [hover, setHover] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const enter = () => setHover(true)
    const leave = () => setHover(false)

    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
    }
  }, [ref])

  return hover
}
