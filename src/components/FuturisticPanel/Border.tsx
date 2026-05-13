import { useEffect, useRef } from "react"
import { animate, utils } from "animejs"
import type { PanelState } from "./types"

interface Props {
  width: number
  height: number
  state: PanelState
  color: string
  selectedColor: string
  strokeWidth: number
  delay?: number
}

type LineKey = "t" | "b" | "l" | "r"

const HOVER_OFFSET = 10

export function Border({ width, height, state, color, selectedColor, strokeWidth, delay = 0 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const lineRefs: Record<LineKey, React.RefObject<SVGLineElement | null>> = {
    t: useRef(null),
    b: useRef(null),
    l: useRef(null),
    r: useRef(null),
  }

  // Initialize line positions to "hidden" (collapsed at center) so the first
  // visible-state animation has somewhere to expand from.
  useEffect(() => {
    const t = lineRefs.t.current
    const b = lineRefs.b.current
    const l = lineRefs.l.current
    const r = lineRefs.r.current
    if (!t || !b || !l || !r) return
    const cx = width / 2
    const cy = height / 2
    t.setAttribute("x1", String(cx)); t.setAttribute("x2", String(cx))
    b.setAttribute("x1", String(cx)); b.setAttribute("x2", String(cx))
    l.setAttribute("y1", String(cy)); l.setAttribute("y2", String(cy))
    r.setAttribute("y1", String(cy)); r.setAttribute("y2", String(cy))
    // Only run once on first mount; further updates handled by animation effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const t = lineRefs.t.current
    const b = lineRefs.b.current
    const l = lineRefs.l.current
    const r = lineRefs.r.current
    if (!t || !b || !l || !r || width === 0 || height === 0) return

    utils.remove([t, b, l, r])

    const stroke = state === "selected" ? selectedColor : color
    const sw = state === "selected" || state === "hover" ? strokeWidth * 2 : strokeWidth

    const offset = state === "hover" || state === "selected" ? HOVER_OFFSET : 0
    const innerX1 = offset
    const innerX2 = width - offset
    const innerY1 = offset
    const innerY2 = height - offset

    // Set stroke + width imperatively (cheap, no animation needed for these unless transitioning).
    for (const el of [t, b, l, r]) {
      animate(el, {
        stroke,
        "stroke-width": sw,
        duration: 240,
        delay,
        ease: "outExpo",
      })
    }

    if (state === "hidden") {
      const cx = width / 2
      const cy = height / 2
      animate([t, b], { x1: cx, x2: cx, duration: 400, delay, ease: "inOutCirc" })
      animate([l, r], { y1: cy, y2: cy, duration: 400, delay: delay + 200, ease: "inOutCirc" })
      return
    }

    if (state === "visible") {
      animate([t, b], { x1: 0, x2: width, duration: 400, delay, ease: "outExpo" })
      animate([l, r], { y1: 0, y2: height, duration: 400, delay: delay + 200, ease: "outExpo" })
      return
    }

    if (state === "normal") {
      animate([t, b], { x1: 0, x2: width, duration: 360, delay, ease: "outExpo" })
      animate([l, r], { y1: 0, y2: height, duration: 360, delay, ease: "outExpo" })
      return
    }

    // hover + selected share inset geometry
    animate([t, b], { x1: innerX1, x2: innerX2, duration: 400, delay, ease: "outExpo" })
    animate([l, r], { y1: innerY1, y2: innerY2, duration: 400, delay, ease: "outExpo" })
  }, [state, width, height, color, selectedColor, strokeWidth, delay])

  // +0.2 nudge mirrors the original library workaround for SVG edge clipping
  const padded = { width: width + 0.2, height: height + 0.2 }

  return (
    <svg
      ref={svgRef}
      className="fp-border"
      width={padded.width}
      height={padded.height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
    >
      <line ref={lineRefs.t} y1={0} y2={0} stroke={color} strokeWidth={strokeWidth} />
      <line ref={lineRefs.b} y1={height} y2={height} stroke={color} strokeWidth={strokeWidth} />
      <line ref={lineRefs.l} x1={0} x2={0} stroke={color} strokeWidth={strokeWidth} />
      <line ref={lineRefs.r} x1={width} x2={width} stroke={color} strokeWidth={strokeWidth} />
    </svg>
  )
}
