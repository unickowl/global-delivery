import { useEffect, useRef } from "react"
import { animate, utils } from "animejs"
import type { CornerKey, PanelState } from "./types"

interface Props {
  width: number
  height: number
  state: PanelState
  color: string
  selectedColor: string
  size: number
  delay?: number
  corners?: CornerKey[]
}

function pathFor(key: CornerKey, w: number, h: number, size: number) {
  switch (key) {
    case "lt": return `M0 0 H${size} L0 ${size}V0 Z`
    case "rt": return `M${w} 0 L${w} ${size} L${w - size} 0 Z`
    case "rb": return `M${w} ${h} L${w - size} ${h} L${w} ${h - size} Z`
    case "lb": return `M0 ${h} L0 ${h - size} L${size} ${h} Z`
  }
}

function centerFor(key: CornerKey, w: number, h: number, size: number): [number, number] {
  switch (key) {
    case "lt": return [size / 2, size / 2]
    case "rt": return [w - size / 2, size / 2]
    case "rb": return [w - size / 2, h - size / 2]
    case "lb": return [size / 2, h - size / 2]
  }
}

export function Corner({
  width,
  height,
  state,
  color,
  selectedColor,
  size,
  delay = 0,
  corners = ["lt", "rt", "rb", "lb"],
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const attrRef = useRef({
    off: size,
    rot: 0,
    fill: color,
  })

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || width === 0 || height === 0) return

    const paths = svg.querySelectorAll<SVGPathElement>("path[data-corner]")
    if (paths.length === 0) return

    utils.remove(svg)
    utils.remove(attrRef.current)

    const targetOff = (() => {
      switch (state) {
        case "hidden": return size
        case "normal":
        case "visible": return size / 4
        case "hover": return size / 2
        case "selected": return -size / 4
      }
    })()

    const targetRot = state === "selected" ? 180 : 0
    const targetFill = state === "selected" ? selectedColor : color
    const targetOpacity = state === "hidden" ? 0 : 1

    const ease = state === "selected" ? "inOutCirc" : state === "hidden" ? "inExpo" : "outExpo"
    const duration = state === "visible" || state === "hidden" ? 400 : 300

    attrRef.current.fill = targetFill

    animate(attrRef.current, {
      off: targetOff,
      rot: targetRot,
      duration,
      delay,
      ease,
      onUpdate: () => {
        const { off, rot, fill } = attrRef.current
        svg.style.left = `${-off}px`
        svg.style.top = `${-off}px`
        svg.style.width = `${width + off * 2}px`
        svg.style.height = `${height + off * 2}px`

        const w = width + off * 2
        const h = height + off * 2

        paths.forEach((path) => {
          const key = path.dataset.corner as CornerKey
          if (!key) return
          const [cx, cy] = centerFor(key, w, h, size)
          path.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`)
          path.setAttribute("fill", fill)
          path.setAttribute("d", pathFor(key, w, h, size))
        })

        svg.setAttribute("viewBox", `0 0 ${w} ${h}`)
      },
    })

    animate(svg, {
      opacity: targetOpacity,
      duration: state === "hidden" ? duration / 2 : 200,
      delay: state === "hidden" ? delay + duration / 2 : delay,
      ease: "linear",
    })
  }, [state, width, height, color, selectedColor, size, delay])

  const w = width + size * 2
  const h = height + size * 2

  return (
    <svg
      ref={svgRef}
      className="fp-corner"
      style={{
        left: `${-size}px`,
        top: `${-size}px`,
        width: `${w}px`,
        height: `${h}px`,
        opacity: 0,
      }}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden
    >
      {corners.map((key) => (
        <path
          key={key}
          data-corner={key}
          d={pathFor(key, w, h, size)}
          fill={color}
        />
      ))}
    </svg>
  )
}
