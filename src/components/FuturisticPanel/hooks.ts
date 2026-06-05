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

/**
 * Effective HUD scale factor = root font-size / 16px. Captures both the
 * automatic viewport clamp and the manual `--ui-scale` knob (styles.css sets
 * `:root { font-size: calc(clamp(...) * var(--ui-scale)) }`). Frame detail
 * sizes that live in absolute px (SVG stroke, corner size, ticks) multiply by
 * this so the whole panel frame scales proportionally with the rem-based HUD.
 */
function readUiScale() {
  if (typeof window === "undefined") return 1
  const px = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return px > 0 ? px / 16 : 1
}

export function useUiScale() {
  const [scale, setScale] = useState(readUiScale)

  useEffect(() => {
    const update = () => setScale(readUiScale())
    update()
    window.addEventListener("resize", update)
    // --ui-scale is written to the documentElement style attribute by the
    // HUD Scale slider; observe it so manual changes re-scale the frame live.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] })
    return () => {
      window.removeEventListener("resize", update)
      observer.disconnect()
    }
  }, [])

  return scale
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
