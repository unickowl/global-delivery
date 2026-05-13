import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { CSSProperties, HTMLAttributes, ReactNode } from "react"
import { animate, utils } from "animejs"
import { Border } from "./Border"
import { Corner } from "./Corner"
import { useBoot } from "./context"
import { useElementSize, useHover } from "./hooks"
import type { PanelState } from "./types"

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
  /** Disable border lines entirely. */
  disableBorder?: boolean
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
    disableBorder = false,
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

  useImperativeHandle(forwardedRef, () => sizeRef.current as HTMLDivElement)

  // Whenever the boot epoch changes, replay the reveal animation: drop the
  // "hasBootedOnce" flag so the next true bootVisible triggers the staged
  // "visible" sequence again.
  useEffect(() => {
    setHasBootedOnce(false)
  }, [epoch])

  // Once the boot reveal has played, settle into the resting "normal" state.
  useEffect(() => {
    if (!bootVisible || hasBootedOnce) return
    const id = window.setTimeout(() => setHasBootedOnce(true), 600 + revealDelay + 200)
    return () => window.clearTimeout(id)
  }, [bootVisible, hasBootedOnce, revealDelay])

  const state = resolveState(bootVisible, selected, hover, hasBootedOnce)

  // Apply revealDelay only to the boot reveal; transient state changes use no delay.
  const layerDelay = state === "visible" || state === "hidden" ? revealDelay : 0

  // Flicker the panel's content (non-SVG children) on visible/hidden transitions.
  // steps(5) gives the retro CRT-flicker feel from the source library's
  // content-typical part.
  useEffect(() => {
    const el = sizeRef.current
    if (!el) return
    // Exclude nested .futuristic-panel children — they run their own flicker.
    const targets = Array.from(el.children).filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement && !c.classList.contains("futuristic-panel"),
    )
    if (targets.length === 0) return

    utils.remove(targets)
    const prev = prevContentStateRef.current
    prevContentStateRef.current = state

    if (state === "visible") {
      animate(targets, {
        opacity: [0, 0.1, 0.8, 0.3, 1],
        duration: 320,
        delay: layerDelay + 250,
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
        />
      )}
      {children}
    </div>
  )
})
