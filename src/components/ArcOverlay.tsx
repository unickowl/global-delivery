import type { RefObject } from "react"
import type { Transaction } from "../data/transactions"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

export type GlobeSettingsState = {
  arcHeight: number
  rotateSpeed: number
  arcBrightness: number
  showGrid: boolean
  maxLargeAnimated: number
  drawDuration: number
  smallAnimate: boolean
  largeThreshold: number
  flowCount: number
  normalLineWidth: number
  normalGlow: number
  normalHighlight: number
  normalPulse: number
  normalFlowSpeed: number
  largeTrailLength: number
  largeGlow: number
  largeDotScale: number
  largeFlightSpeed: number
  surfaceBrightness: number
  landBrightness: number
  /** Show film-grain noise on each HUD panel. */
  grainEnabled: boolean
  /** Opacity of the per-panel noise layer (0–0.6). */
  grainOpacity: number
  /** Fractal noise baseFrequency. Higher = finer grain (0.3 chunky → 1.5 fine). */
  grainScale: number
  /** Grain shimmer speed multiplier. 0 = paused, 1 = default (1200ms cycle). */
  grainSpeed: number
  /** Show irregular RGB-offset glitch bursts on top of the grain. */
  grainGlitch: boolean
  /** Strength of each glitch burst (0–1). */
  grainGlitchStrength: number
}

type ArcOverlayProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  globeSettings: GlobeSettingsState
  phiRef: RefObject<number>
  thetaRef: RefObject<number>
}

export function ArcOverlay(_props: ArcOverlayProps) {
  return null
}
