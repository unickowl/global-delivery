import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../ArcOverlay"
import type { FlowTx } from "./flow"
import { hashText } from "./flow"
import { type Vec3, clamp, easeInOutQuad, toVec3 } from "./vec3"
import { ARC_SEGMENTS, FADING_MS } from "./constants"
import { createArcPoints } from "./route"
import { renderFlowCount } from "./settings"

export function lineSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, largeOnly: boolean, now: number) {
  const positions: number[] = []
  const targetCount = renderFlowCount(settings)
  const active = flows.slice(0, targetCount)

  for (const flow of active) {
    if (flow.status === "failed") continue
    if (flow.isLarge !== largeOnly) continue
    const fade = flow.usesAnime ? flow.fadeAlpha : flow.phase === "fading" ? 1 - clamp((now - flow.phaseStartedAt) / FADING_MS, 0, 1) : 1
    if (fade <= 0.03) continue
    if (flow.phase === "arriving" || flow.phase === "landing") continue
    let visiblePoints = flow.arcPoints.length
    if (flow.phase === "drawing") {
      const head = flow.usesAnime ? flow.drawProgress : easeInOutQuad(clamp((now - flow.phaseStartedAt) / settings.drawDuration, 0, 1))
      visiblePoints = Math.max(2, Math.floor(flow.arcPoints.length * head))
    }
    for (let i = 0; i < visiblePoints - 1; i += 1) {
      const a = flow.arcPoints[i]
      const b = flow.arcPoints[i + 1]
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }

  return new Float32Array(positions)
}

function pushArcRange(positions: number[], points: Vec3[], from: number, to: number) {
  const segmentCount = points.length - 1
  const start = Math.floor(clamp(from, 0, 1) * segmentCount)
  const end = Math.max(start + 1, Math.floor(clamp(to, 0, 1) * segmentCount))
  for (let i = start; i < Math.min(end, segmentCount); i += 1) {
    const a = points[i]
    const b = points[i + 1]
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
}

export function shimmerSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
  const tailPositions: number[] = []
  const midPositions: number[] = []
  const headPositions: number[] = []
  const targetCount = renderFlowCount(settings)
  const normalFlowSpeed = settings.normalFlowSpeed ?? 1
  for (const flow of flows.slice(0, targetCount)) {
    if (flow.status === "failed") continue
    if (flow.isLarge || flow.phase === "arriving" || flow.phase === "landing" || flow.phase === "fading") continue
    const drawLimit = flow.phase === "drawing" ? clamp(flow.drawProgress, 0, 1) : 1
    if (drawLimit <= 0.05) continue
    const cycle = 5200 / clamp(normalFlowSpeed, 0.1, 5)
    const head = Math.min(drawLimit, ((now + (hashText(flow.id) % 5000)) % cycle) / cycle)
    pushArcRange(tailPositions, flow.arcPoints, head - 0.22, head - 0.12)
    pushArcRange(midPositions, flow.arcPoints, head - 0.12, head - 0.045)
    pushArcRange(headPositions, flow.arcPoints, head - 0.045, head)
  }
  return [new Float32Array(tailPositions), new Float32Array(midPositions), new Float32Array(headPositions)] as const
}

export function largeTrailSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState) {
  const positions: number[] = []
  const trailLength = settings.largeTrailLength ?? 0.24
  for (const flow of flows) {
    if (flow.status === "failed") continue
    if (!flow.isLarge || flow.phase !== "flying") continue
    const head = clamp(flow.flightProgress, 0, 1)
    const tail = Math.max(0, head - trailLength)
    const start = Math.floor(tail * (flow.arcPoints.length - 1))
    const end = Math.max(start + 1, Math.floor(head * (flow.arcPoints.length - 1)))
    for (let i = start; i < Math.min(end, flow.arcPoints.length - 1); i += 1) {
      const a = flow.arcPoints[i]
      const b = flow.arcPoints[i + 1]
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }
  return new Float32Array(positions)
}

export function failedSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
  const positions: number[] = []
  const targetCount = renderFlowCount(settings)
  for (const flow of flows.slice(0, targetCount)) {
    if (flow.status !== "failed") continue
    const fade = flow.phase === "fading" ? 1 - clamp((now - flow.phaseStartedAt) / FADING_MS, 0, 1) : flow.fadeAlpha
    if (fade <= 0.03) continue
    const drawLimit = flow.phase === "drawing" ? easeInOutQuad(clamp((now - flow.phaseStartedAt) / settings.drawDuration, 0, 1)) : 1
    const visiblePoints = Math.max(2, Math.floor(flow.arcPoints.length * drawLimit))
    for (let i = 0; i < visiblePoints - 1; i += 1) {
      const a = flow.arcPoints[i]
      const b = flow.arcPoints[i + 1]
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }
  return new Float32Array(positions)
}

export function selectedRouteSegments(selected: Transaction, settings: GlobeSettingsState, now: number, trailBoost = 0, fullRoute = false) {
  const from = toVec3(selected.source.lat, selected.source.lng)
  const to = toVec3(selected.target.lat, selected.target.lng)
  const points = createArcPoints(from, to, settings.arcHeight * 0.9, ARC_SEGMENTS)
  const phase = (now % 3600) / 3600
  const trailLength = 0.18 + trailBoost * 0.18
  const start = fullRoute ? 0 : Math.floor(Math.max(0, phase - trailLength) * (points.length - 1))
  const end = fullRoute ? points.length - 1 : Math.max(start + 1, Math.floor(phase * (points.length - 1)))
  const positions: number[] = []
  for (let i = start; i < Math.min(end, points.length - 1); i += 1) {
    const a = points[i]
    const b = points[i + 1]
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
  return new Float32Array(positions)
}

export function selectedRouteSegmentsProgress(selected: Transaction, settings: GlobeSettingsState, progress: number, fullRoute = false) {
  const from = toVec3(selected.source.lat, selected.source.lng)
  const to = toVec3(selected.target.lat, selected.target.lng)
  const points = createArcPoints(from, to, settings.arcHeight * 0.9, ARC_SEGMENTS)
  const head = clamp(progress, 0, 1)
  const tail = Math.max(0, head - 0.22)
  const start = fullRoute ? 0 : Math.floor(tail * (points.length - 1))
  const end = fullRoute ? points.length - 1 : Math.max(start + 1, Math.floor(head * (points.length - 1)))
  const positions: number[] = []
  for (let i = start; i < Math.min(end, points.length - 1); i += 1) {
    const a = points[i]
    const b = points[i + 1]
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
  }
  return new Float32Array(positions)
}

export function gridSegments() {
  const positions: number[] = []
  const pushLine = (points: Vec3[]) => {
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }
  for (let lat = -60; lat <= 60; lat += 20) {
    const points: Vec3[] = []
    for (let lng = -180; lng <= 180; lng += 6) points.push(toVec3(lat, lng).map((v) => v * 1.01) as Vec3)
    pushLine(points)
  }
  for (let lng = -180; lng < 180; lng += 20) {
    const points: Vec3[] = []
    for (let lat = -80; lat <= 80; lat += 5) points.push(toVec3(lat, lng).map((v) => v * 1.01) as Vec3)
    pushLine(points)
  }
  return new Float32Array(positions)
}
