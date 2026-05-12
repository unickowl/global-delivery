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
