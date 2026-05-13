import { useEffect, useRef } from "react"
import { animate, utils } from "animejs"
import type { PanelState } from "./types"

interface Props {
  width: number
  height: number
  state: PanelState
  color: string
  selectedColor: string
  size: number
  delay?: number
}

export function Corner({ width, height, state, color, selectedColor, size, delay = 0 }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const attrRef = useRef({
    off: size,
    rot: 0,
    fill: color,
  })

  // Force a re-render on each frame by bumping a tiny state — but we use refs
  // and set attributes imperatively, so no React state is needed. Render uses
  // the *initial* attrRef values; animations then mutate the DOM directly.

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || width === 0 || height === 0) return

    const paths = svg.querySelectorAll<SVGPathElement>("path[data-corner]")
    if (paths.length !== 4) return

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

    // Anime.js v4 trips on object targets when the param key collides with a
    // real CSS property (e.g. `color`, `rotate`, `offset`). We use short,
    // non-CSS keys (`off`, `rot`, `fill`) and snap `fill` outside the tween.
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
        const cornerCenters: Array<[number, number]> = [
          [size / 2, size / 2],
          [w - size / 2, size / 2],
          [w - size / 2, h - size / 2],
          [size / 2, h - size / 2],
        ]

        const dList = [
          `M0 0 H${size} L0 ${size}V0 Z`,
          `M${w} 0 L${w} ${size} L${w - size} 0 Z`,
          `M${w} ${h} L${w - size} ${h} L${w} ${h - size} Z`,
          `M0 ${h} L0 ${h - size} L${size} ${h} Z`,
        ]

        paths.forEach((path, i) => {
          const [cx, cy] = cornerCenters[i]
          path.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`)
          path.setAttribute("fill", fill)
          path.setAttribute("d", dList[i])
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

  // Render: SVG with 4 filled triangle paths at each corner. Initial layout
  // uses size as the offset, matching attrRef defaults. Animation effect
  // overrides positions imperatively after mount.
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
      <path data-corner="lt" d={`M0 0 H${size} L0 ${size}V0 Z`} fill={color} />
      <path data-corner="rt" d={`M${w} 0 L${w} ${size} L${w - size} 0 Z`} fill={color} />
      <path data-corner="rb" d={`M${w} ${h} L${w - size} ${h} L${w} ${h - size} Z`} fill={color} />
      <path data-corner="lb" d={`M0 ${h} L0 ${h - size} L${size} ${h} Z`} fill={color} />
    </svg>
  )
}
