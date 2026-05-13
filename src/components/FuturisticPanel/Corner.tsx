import type { CornerKey, PanelState } from "./types"

interface Props {
  width: number
  height: number
  state: PanelState
  color: string
  selectedColor: string
  size: number
  corners?: CornerKey[]
}

/**
 * Renders the corner triangles as SVG <g> groups inside a panel-sized SVG.
 * Position is controlled entirely by the parent FuturisticPanel via imperative
 * `transform` updates on the <g> groups (synced with the panel's clip-path
 * open/close animation). Color is driven by React state here.
 */
export function Corner({
  width,
  height,
  state,
  color,
  selectedColor,
  size,
  corners = ["lt", "rb"],
}: Props) {
  if (width === 0 || height === 0) return null

  const fill = state === "selected" ? selectedColor : color

  // Initial transforms — closed state, both triangles at the panel's center
  // forming a single small square. JS overrides these on mount.
  const cx = width / 2
  const cy = height / 2
  const initX = cx - size / 2
  const initY = cy - size / 2
  const closedTransform = `translate(${initX} ${initY})`

  return (
    <svg
      className="fp-corner"
      style={{
        left: 0,
        top: 0,
        width: `${width}px`,
        height: `${height}px`,
      }}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden
    >
      {corners.includes("lt") && (
        <g data-corner-group="lt" transform={closedTransform}>
          <path d={`M0 0 H${size} L0 ${size}V0 Z`} fill={fill} />
        </g>
      )}
      {corners.includes("rb") && (
        <g data-corner-group="rb" transform={closedTransform}>
          <path d={`M${size} ${size} L0 ${size} L${size} 0 Z`} fill={fill} />
        </g>
      )}
      {corners.includes("rt") && (
        <g data-corner-group="rt" transform={closedTransform}>
          <path d={`M${size} 0 L${size} ${size} L0 0 Z`} fill={fill} />
        </g>
      )}
      {corners.includes("lb") && (
        <g data-corner-group="lb" transform={closedTransform}>
          <path d={`M0 ${size} L${size} ${size} L0 0 Z`} fill={fill} />
        </g>
      )}
    </svg>
  )
}
