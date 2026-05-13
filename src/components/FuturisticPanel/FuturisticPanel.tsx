import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import { animate, utils } from "animejs"
import { Border } from "./Border"
import { Corner } from "./Corner"
import { useBoot } from "./context"
import { useElementSize, useHover } from "./hooks"
import type { CornerKey, PanelState } from "./types"

export interface FuturisticPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "color"> {
  selected?: boolean
  /** Manual hover override; if omitted, hover is auto-detected. */
  hover?: boolean
  /** Per-panel offset added to the boot reveal stagger (ms). */
  revealDelay?: number
  color?: string
  selectedColor?: string
  strokeWidth?: number
  cornerSize?: number
  /** Disable corner brackets entirely. */
  disableCorner?: boolean
  /** Disable border lines entirely. Defaults to true — the panel relies on
   *  a chamfered clip-path shape rather than drawn perimeter lines. */
  disableBorder?: boolean
  /** Which corners to render as filled triangles. */
  corners?: CornerKey[]
  /** Stenciled station ID rendered near the top-left corner (e.g. "FS-01"). */
  label?: string
  /** Show a vertical scan beam that loops while the panel is visible. */
  scanning?: boolean
  children: ReactNode
}

const DEFAULT_COLOR = "var(--hud-cyan, #7df6ff)"
const DEFAULT_SELECTED = "#ff8d0a"

function resolveState(
  bootVisible: boolean,
  selected: boolean,
  hover: boolean,
  hasBootedOnce: boolean,
): PanelState {
  if (!bootVisible) return "hidden"
  if (!hasBootedOnce) return "visible"
  if (selected) return "selected"
  if (hover) return "hover"
  return "normal"
}

export const FuturisticPanel = forwardRef<HTMLDivElement, FuturisticPanelProps>(function FuturisticPanel(
  {
    selected = false,
    hover: hoverOverride,
    revealDelay = 0,
    color = DEFAULT_COLOR,
    selectedColor = DEFAULT_SELECTED,
    strokeWidth = 1,
    cornerSize = 10,
    disableCorner = false,
    disableBorder = true,
    corners = ["lt", "rb"],
    label,
    scanning = false,
    className,
    children,
    style,
    ...rest
  },
  forwardedRef,
) {
  const [sizeRef, size] = useElementSize<HTMLDivElement>()
  const autoHover = useHover(sizeRef)
  const hover = hoverOverride ?? autoHover

  const { visible: bootVisible, epoch } = useBoot()
  const [hasBootedOnce, setHasBootedOnce] = useState(false)
  const prevContentStateRef = useRef<PanelState | null>(null)
  // Open-progress: 0 = closed (small center square), 1 = horizontal band,
  // 2 = fully open chamfered shape. Drives both clip-path and corner positions.
  const openRef = useRef({ p: 0 })

  useImperativeHandle(forwardedRef, () => sizeRef.current as HTMLDivElement)

  // Whenever the boot epoch changes, replay the reveal animation: drop the
  // "hasBootedOnce" flag so the next true bootVisible triggers the staged
  // "visible" sequence again.
  useEffect(() => {
    setHasBootedOnce(false)
  }, [epoch])

  // Once the boot reveal has played, settle into the resting "normal" state.
  // Open total: 150 (square flicker) + 350 (H expand) + 350 (V expand) +
  // 320 (content flicker) ≈ 1170ms, so wait at least that long.
  useEffect(() => {
    if (!bootVisible || hasBootedOnce) return
    const id = window.setTimeout(() => setHasBootedOnce(true), 1250 + revealDelay)
    return () => window.clearTimeout(id)
  }, [bootVisible, hasBootedOnce, revealDelay])

  const state = resolveState(bootVisible, selected, hover, hasBootedOnce)

  // Apply revealDelay only to the boot reveal; transient state changes use no delay.
  const layerDelay = state === "visible" || state === "hidden" ? revealDelay : 0

  // Two-phase open/close animation: the panel's clip-path expands from a small
  // center square to a horizontal band (phase 1), then to the full chamfered
  // shape (phase 2). Corner triangles slide outward in sync. Close reverses
  // the sequence and runs *after* the content flicker fades out.
  useEffect(() => {
    const panel = sizeRef.current
    if (!panel || size.width === 0 || size.height === 0) return

    const ltGroup = panel.querySelector<SVGGElement>('[data-corner-group="lt"]')
    const rbGroup = panel.querySelector<SVGGElement>('[data-corner-group="rb"]')

    const applyShape = (p: number) => {
      const cw = size.width
      const ch = size.height
      const cs = cornerSize
      const cx = cw / 2
      const cy = ch / 2

      const phase1 = Math.min(p, 1)
      const phase2 = Math.max(p - 1, 0)

      // Visible region half-dimensions: starts as a cs×cs square at center,
      // grows to full size as the two phases progress.
      const halfW = cs / 2 + (cw / 2 - cs / 2) * phase1
      const halfH = cs / 2 + (ch / 2 - cs / 2) * phase2

      const left = cx - halfW
      const right = cx + halfW
      const top = cy - halfH
      const bottom = cy + halfH

      // Chamfer + corner-overflow only fade in during phase 2 — while the
      // panel is still a band, the visible region is a plain rectangle.
      // Scale the chamfer with cornerSize so small panels (tx rows, coords)
      // get proportionally smaller cuts.
      const cham = (cs + 4) * phase2
      const overflow = cs * phase2

      panel.style.clipPath = `polygon(${left - overflow}px ${top - overflow}px, ${right - cham}px ${top}px, ${right}px ${top + cham}px, ${right + overflow}px ${bottom + overflow}px, ${left + cham}px ${bottom}px, ${left}px ${bottom - cham}px)`

      if (ltGroup) ltGroup.setAttribute("transform", `translate(${left} ${top})`)
      if (rbGroup) rbGroup.setAttribute("transform", `translate(${right - cs} ${bottom - cs})`)
    }

    utils.remove(openRef.current)
    utils.remove(panel)

    const target = state === "hidden" ? 0 : 2
    const current = openRef.current.p

    // Already at target — just snap (covers normal/hover/selected and the
    // very first mount where state="hidden" and p is already 0).
    if (Math.abs(current - target) < 0.01) {
      applyShape(target)
      panel.style.opacity = state === "hidden" ? "0" : "1"
      return
    }

    if (target === 2) {
      // OPEN:
      //   ① flicker the tiny center square in (150ms, opacity 0 → 1)
      //   ② horizontal expand (350ms, p: current → 1)
      //   ③ vertical expand (350ms, p: 1 → 2)
      animate(panel, {
        opacity: [0, 0.4, 0.1, 0.7, 1],
        duration: 150,
        delay: layerDelay,
        ease: "steps(5)",
      })
      animate(openRef.current, {
        p: 1,
        duration: 350,
        delay: layerDelay + 150,
        ease: "outExpo",
        onUpdate: () => applyShape(openRef.current.p),
      }).then(() => {
        animate(openRef.current, {
          p: 2,
          duration: 350,
          ease: "outExpo",
          onUpdate: () => applyShape(openRef.current.p),
        })
      })
    } else {
      // CLOSE (reverse of open):
      //   ① content flicker out (320ms, handled by content effect)
      //   ② vertical collapse (350ms, p: current → 1)
      //   ③ horizontal collapse to small square (350ms, p: 1 → 0)
      //   ④ flicker the tiny center square out (150ms, opacity 1 → 0)
      animate(openRef.current, {
        p: 1,
        duration: 350,
        delay: layerDelay + 320,
        ease: "inExpo",
        onUpdate: () => applyShape(openRef.current.p),
      })
        .then(() =>
          animate(openRef.current, {
            p: 0,
            duration: 350,
            ease: "inExpo",
            onUpdate: () => applyShape(openRef.current.p),
          }),
        )
        .then(() => {
          animate(panel, {
            opacity: [1, 0.7, 0.1, 0.4, 0],
            duration: 150,
            ease: "steps(5)",
          })
        })
    }
  }, [state, size.width, size.height, layerDelay, cornerSize, sizeRef])

  // Flicker the panel's content (non-SVG children) on visible/hidden transitions.
  // steps(5) gives the retro CRT-flicker feel from the source library's
  // content-typical part.
  useEffect(() => {
    const el = sizeRef.current
    if (!el) return
    // Exclude nested .futuristic-panel children (they run their own flicker)
    // and the scan beam (it has its own CSS-driven loop).
    const targets = Array.from(el.children).filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement &&
        !c.classList.contains("futuristic-panel") &&
        !c.classList.contains("fp-scan-beam"),
    )
    if (targets.length === 0) return

    utils.remove(targets)
    const prev = prevContentStateRef.current
    prevContentStateRef.current = state

    if (state === "visible") {
      animate(targets, {
        opacity: [0, 0.1, 0.8, 0.3, 1],
        duration: 320,
        // Wait for square flicker (150) + horizontal expand (350) + vertical
        // expand (350) = 850ms before flickering content in.
        delay: layerDelay + 870,
        ease: "steps(5)",
      })
      return
    }

    if (state === "hidden") {
      if (prev === null) {
        // First render before boot reveal: snap content invisible, don't tween.
        targets.forEach((t) => {
          t.style.opacity = "0"
        })
      } else {
        animate(targets, {
          opacity: [1, 0.6, 0.1, 0.3, 0],
          duration: 320,
          delay: layerDelay,
          ease: "steps(5)",
        })
      }
      return
    }

    // normal / hover / selected — ensure content stays fully visible. Brief
    // settle in case a prior visible/hidden tween was interrupted mid-flicker.
    animate(targets, { opacity: 1, duration: 100, ease: "linear" })
  }, [state, layerDelay, sizeRef])

  const wrapperStyle: CSSProperties = useMemo(
    () => ({
      ...style,
      // Expose accent as a CSS variable so children (tx items, badges) can react.
      ["--fp-accent" as string]: state === "selected" ? selectedColor : color,
    }),
    [style, state, color, selectedColor],
  )

  return (
    <div
      {...rest}
      ref={sizeRef}
      className={["futuristic-panel", className].filter(Boolean).join(" ")}
      style={wrapperStyle}
      data-fp-state={state}
    >
      {!disableBorder && size.width > 0 && (
        <Border
          width={size.width}
          height={size.height}
          state={state}
          color={color}
          selectedColor={selectedColor}
          strokeWidth={strokeWidth}
          delay={layerDelay}
        />
      )}
      {!disableCorner && size.width > 0 && (
        <Corner
          width={size.width}
          height={size.height}
          state={state}
          color={color}
          selectedColor={selectedColor}
          size={cornerSize}
          delay={layerDelay}
          corners={corners}
        />
      )}
      {label && <span className="fp-label" aria-hidden>{label}</span>}
      {scanning && state !== "hidden" && <span className="fp-scan-beam" aria-hidden />}
      {children}
    </div>
  )
})
