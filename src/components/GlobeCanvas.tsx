import { type MutableRefObject, useEffect, useMemo, useRef } from "react"
import type { Transaction } from "../data/transactions"
import { FLIGHT_DURATION } from "../App"
import type { GlobeSettingsState } from "./ArcOverlay"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

type GlobeCanvasProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  flightStartedAt: number | null
  onFlightDone: () => void
  globeSettings: GlobeSettingsState
  phiRef: MutableRefObject<number>
  thetaRef: MutableRefObject<number>
}

type Vec3 = [number, number, number]
type LandPoint = { vec: Vec3; seed: number }
type FlowPhase = "arriving" | "flying" | "landing" | "drawing" | "breathing" | "fading"
type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
type FlowTx = {
  id: string
  from: FlowNode
  to: FlowNode
  amount: number
  isLarge: boolean
  phase: FlowPhase
  startedAt: number
  phaseStartedAt: number
  duration: number
  flightProgress: number
  breathAlpha: number
  arcHeight: number
}

const MAX_FLOWS = 280
const ARRIVING_MS = 1600
const FLYING_MS = 3200
const LANDING_MS = 1200
const FADING_MS = 1500

const LAND_POLYGONS: Array<Array<[number, number]>> = [
  [[72, -168], [61, -148], [48, -126], [31, -120], [16, -101], [8, -82], [24, -76], [47, -66], [60, -52], [72, -96]],
  [[12, -80], [5, -62], [-9, -44], [-24, -45], [-55, -70], [-36, -75], [-14, -77]],
  [[70, -12], [60, 18], [54, 74], [62, 146], [49, 170], [30, 124], [10, 104], [7, 79], [24, 58], [36, 13], [45, -8]],
  [[35, -18], [29, 30], [8, 45], [-9, 38], [-34, 20], [-35, 4], [-20, -15], [5, -16]],
  [[-11, 112], [-18, 151], [-36, 154], [-44, 134], [-30, 114]],
  [[72, -56], [82, -38], [76, -20], [62, -42]],
  [[20, 94], [10, 110], [-5, 128], [-9, 116], [7, 94]],
]

const EXTRA_NODES: Array<Omit<FlowNode, "vec">> = [
  { city: "New York", country: "United States", lat: 40.7128, lng: -74.006 },
  { city: "Toronto", country: "Canada", lat: 43.6532, lng: -79.3832 },
  { city: "Los Angeles", country: "United States", lat: 34.0522, lng: -118.2437 },
  { city: "Frankfurt", country: "Germany", lat: 50.1109, lng: 8.6821 },
  { city: "Paris", country: "France", lat: 48.8566, lng: 2.3522 },
  { city: "Zurich", country: "Switzerland", lat: 47.3769, lng: 8.5417 },
  { city: "Mumbai", country: "India", lat: 19.076, lng: 72.8777 },
  { city: "Seoul", country: "South Korea", lat: 37.5665, lng: 126.978 },
  { city: "Jakarta", country: "Indonesia", lat: -6.2088, lng: 106.8456 },
  { city: "Manila", country: "Philippines", lat: 14.5995, lng: 120.9842 },
  { city: "Bangkok", country: "Thailand", lat: 13.7563, lng: 100.5018 },
  { city: "Lagos", country: "Nigeria", lat: 6.5244, lng: 3.3792 },
  { city: "Nairobi", country: "Kenya", lat: -1.2921, lng: 36.8219 },
  { city: "Cape Town", country: "South Africa", lat: -33.9249, lng: 18.4241 },
  { city: "Buenos Aires", country: "Argentina", lat: -34.6037, lng: -58.3816 },
  { city: "Lima", country: "Peru", lat: -12.0464, lng: -77.0428 },
  { city: "Santiago", country: "Chile", lat: -33.4489, lng: -70.6693 },
  { city: "Istanbul", country: "Turkey", lat: 41.0082, lng: 28.9784 },
  { city: "Riyadh", country: "Saudi Arabia", lat: 24.7136, lng: 46.6753 },
  { city: "Auckland", country: "New Zealand", lat: -36.8509, lng: 174.7645 },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function toVec3(lat: number, lng: number): Vec3 {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [
    Math.cos(latRad) * Math.cos(lngRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.sin(lngRad),
  ]
}

function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)
  const omega = Math.acos(dot)
  if (Math.abs(omega) < 1e-8) return a
  const sinO = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / sinO
  const wb = Math.sin(t * omega) / sinO
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]
}

function rotatePoint(p: Vec3, phi: number, theta: number): Vec3 {
  const cp = Math.cos(phi)
  const sp = Math.sin(phi)
  const x1 = p[0] * cp + p[2] * sp
  const y1 = p[1]
  const z1 = -p[0] * sp + p[2] * cp
  const ct = Math.cos(-theta)
  const st = Math.sin(-theta)
  return [x1, y1 * ct - z1 * st, y1 * st + z1 * ct]
}

function project(p: Vec3, cx: number, cy: number, radius: number): [number, number] {
  return [cx + p[0] * radius, cy - p[1] * radius]
}

function pointInPolygon(lat: number, lng: number, polygon: Array<[number, number]>) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0]
    const xi = polygon[i][1]
    const yj = polygon[j][0]
    const xj = polygon[j][1]
    const intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.00001) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function createLandPoints(): LandPoint[] {
  const points: LandPoint[] = []
  for (let lat = -88; lat <= 88; lat += 2) {
    for (let lng = -179; lng <= 179; lng += 2) {
      if (LAND_POLYGONS.some((polygon) => pointInPolygon(lat, lng, polygon))) {
        points.push({ vec: toVec3(lat, lng), seed: Math.abs(Math.sin(lat * 12.9898 + lng * 78.233)) })
      }
    }
  }
  return points
}

function amountWeight(amount: number, threshold: number) {
  return clamp(Math.log10(amount + 1) / Math.log10(threshold * 80), 0.25, 1.35)
}

function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

function logNormalAmount() {
  const u = 1 - Math.random()
  const v = 1 - Math.random()
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return clamp(Math.exp(Math.log(500_000) + normal * 2.25), 1_000, 500_000_000)
}

function buildNodes(transactions: Transaction[]): FlowNode[] {
  const map = new Map<string, FlowNode>()
  const add = (node: Omit<FlowNode, "vec">) => {
    const key = `${node.city}-${node.country}`
    if (!map.has(key)) map.set(key, { ...node, vec: toVec3(node.lat, node.lng) })
  }
  EXTRA_NODES.forEach(add)
  transactions.forEach((tx) => {
    add(tx.source)
    add(tx.target)
  })
  return [...map.values()]
}

function createFlow(now: number, nodes: FlowNode[], settings: GlobeSettingsState, largeCount: number, seedBreathing = false): FlowTx {
  const from = nodes[Math.floor(Math.random() * nodes.length)]
  let to = nodes[Math.floor(Math.random() * nodes.length)]
  while (to === from) to = nodes[Math.floor(Math.random() * nodes.length)]

  const amount = logNormalAmount()
  const isActuallyLarge = amount >= settings.largeThreshold
  const isLarge = isActuallyLarge && largeCount < settings.maxLargeAnimated
  const duration = isLarge ? 20_000 + Math.random() * 25_000 : 45_000 + Math.random() * 75_000
  const phase = seedBreathing || (!isLarge && !settings.smallAnimate) ? "breathing" : isLarge ? "arriving" : "drawing"
  const phaseAge = seedBreathing ? Math.random() * duration * 0.7 : 0

  return {
    id: `F-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    from,
    to,
    amount,
    isLarge,
    phase,
    startedAt: now - phaseAge,
    phaseStartedAt: now - phaseAge,
    duration,
    flightProgress: 0,
    breathAlpha: 0.4,
    arcHeight: 0.4 + Math.random() * 0.6,
  }
}

function updateFlows(now: number, flows: FlowTx[], nodes: FlowNode[], settings: GlobeSettingsState, lastAddRef: MutableRefObject<number>) {
  for (const tx of flows) {
    if (now - tx.startedAt >= tx.duration && tx.phase !== "fading") {
      tx.phase = "fading"
      tx.phaseStartedAt = now
    }

    const phaseAge = now - tx.phaseStartedAt
    if (tx.phase === "arriving" && phaseAge >= ARRIVING_MS) {
      tx.phase = "flying"
      tx.phaseStartedAt = now
      tx.flightProgress = 0
    } else if (tx.phase === "flying") {
      const flyingDuration = FLYING_MS / clamp(settings.largeFlightSpeed ?? 1, 0.2, 4)
      tx.flightProgress = easeInOutQuad(clamp(phaseAge / flyingDuration, 0, 1))
      if (phaseAge >= flyingDuration) {
        tx.phase = "landing"
        tx.phaseStartedAt = now
        tx.flightProgress = 1
      }
    } else if (tx.phase === "landing" && phaseAge >= LANDING_MS) {
      tx.phase = "breathing"
      tx.phaseStartedAt = now
    } else if (tx.phase === "drawing" && phaseAge >= settings.drawDuration) {
      tx.phase = "breathing"
      tx.phaseStartedAt = now
    } else if (tx.phase === "breathing") {
      const t = (phaseAge % 2400) / 2400
      tx.breathAlpha = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t))
    }
  }

  for (let i = flows.length - 1; i >= 0; i -= 1) {
    if (flows[i].phase === "fading" && now - flows[i].phaseStartedAt > FADING_MS) flows.splice(i, 1)
  }

  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
  if (flows.length < targetCount && now - lastAddRef.current > 1200 + Math.random() * 1200) {
    const batch = Math.min(targetCount - flows.length, 1 + Math.floor(Math.random() * 3))
    let largeCount = flows.filter((tx) => tx.isLarge && tx.phase !== "fading").length
    for (let i = 0; i < batch; i += 1) {
      const tx = createFlow(now, nodes, settings, largeCount)
      if (tx.isLarge) largeCount += 1
      flows.push(tx)
    }
    lastAddRef.current = now
  }
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, color)
  g.addColorStop(0.45, color.replace(/[\d.]+\)$/, "0.18)"))
  g.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  ctx.fill()
}

function projectedSurface(vec: Vec3, cx: number, cy: number, radius: number, phi: number, theta: number) {
  const rotated = rotatePoint(vec, phi, theta)
  if (rotated[2] < -0.06) return null
  const [x, y] = project(rotated, cx, cy, radius)
  return { x, y, z: rotated[2] }
}

function drawSurfacePulse(
  ctx: CanvasRenderingContext2D,
  vec: Vec3,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  progress: number,
  color: string,
) {
  const p = projectedSurface(vec, cx, cy, radius, phi, theta)
  if (!p) return
  const alpha = 1 - progress
  ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${alpha * 0.9})`)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.arc(p.x, p.y, 8 + progress * 34, 0, Math.PI * 2)
  ctx.stroke()
  drawGlow(ctx, p.x, p.y, 12 + progress * 22, color.replace(/[\d.]+\)$/, `${0.22 + alpha * 0.35})`))
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2)
  ctx.fill()
}

function liftedPoint(from: Vec3, to: Vec3, t: number, height: number): Vec3 {
  const point = slerp(from, to, t)
  const midpoint = slerp(from, to, 0.5)
  const lift = Math.sin(Math.PI * t)
  return [
    point[0] + midpoint[0] * height * lift,
    point[1] + midpoint[1] * height * lift,
    point[2] + midpoint[2] * height * lift,
  ]
}

function drawLiftedArc(
  ctx: CanvasRenderingContext2D,
  from: Vec3,
  to: Vec3,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  height: number,
  startT: number,
  endT: number,
  segments = 42,
) {
  ctx.beginPath()
  let moved = false
  for (let i = 0; i <= segments; i += 1) {
    const t = startT + (endT - startT) * (i / segments)
    const rotated = rotatePoint(liftedPoint(from, to, t, height), phi, theta)
    if (rotated[2] < -0.05) {
      moved = false
      continue
    }
    const [x, y] = project(rotated, cx, cy, radius)
    if (!moved) {
      ctx.moveTo(x, y)
      moved = true
    } else {
      ctx.lineTo(x, y)
    }
  }
}

function drawGlobeShell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  landPoints: LandPoint[],
  showGrid: boolean,
) {
  const ocean = ctx.createRadialGradient(cx - radius * 0.28, cy - radius * 0.32, radius * 0.08, cx, cy, radius)
  ocean.addColorStop(0, "#143363")
  ocean.addColorStop(0.48, "#0b204a")
  ocean.addColorStop(0.86, "#050d26")
  ocean.addColorStop(1, "#020716")
  ctx.fillStyle = ocean
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius - 0.5, 0, Math.PI * 2)
  ctx.clip()

  if (showGrid) {
    ctx.globalAlpha = 0.07
    ctx.strokeStyle = "#6bb7ff"
    ctx.lineWidth = 0.5
    for (let lat = -60; lat <= 60; lat += 20) {
      ctx.beginPath()
      let moved = false
      for (let lng = -180; lng <= 180; lng += 4) {
        const p = projectedSurface(toVec3(lat, lng), cx, cy, radius, phi, theta)
        if (!p) {
          moved = false
          continue
        }
        if (!moved) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
        moved = true
      }
      ctx.stroke()
    }
    for (let lng = -180; lng < 180; lng += 20) {
      ctx.beginPath()
      let moved = false
      for (let lat = -80; lat <= 80; lat += 3) {
        const p = projectedSurface(toVec3(lat, lng), cx, cy, radius, phi, theta)
        if (!p) {
          moved = false
          continue
        }
        if (!moved) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
        moved = true
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  for (const point of landPoints) {
    const rotated = rotatePoint(point.vec, phi, theta)
    if (rotated[2] < 0) continue
    const [x, y] = project(rotated, cx, cy, radius)
    const depth = Math.max(0, rotated[2])
    ctx.globalAlpha = 0.22 + depth * 0.5
    ctx.fillStyle = depth > 0.45 ? "#335f4f" : "#24463f"
    ctx.beginPath()
    ctx.arc(x, y, 0.95 + point.seed * 0.42, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.restore()

  const rim = ctx.createRadialGradient(cx, cy, radius * 0.86, cx, cy, radius * 1.15)
  rim.addColorStop(0, "rgba(30,80,200,0)")
  rim.addColorStop(0.58, "rgba(43,118,255,0.18)")
  rim.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = rim
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2)
  ctx.fill()
}

function drawFlow(
  ctx: CanvasRenderingContext2D,
  tx: FlowTx,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  settings: GlobeSettingsState,
  now: number,
  emphasis = 1,
) {
  const weight = amountWeight(tx.amount, settings.largeThreshold)
  const height = settings.arcHeight * tx.arcHeight
  const alphaBase = settings.arcBrightness * emphasis
  const from = tx.from.vec
  const to = tx.to.vec
  const shimmerSeed = hashText(tx.id) % 5000
  const normalLineWidth = settings.normalLineWidth ?? 1
  const normalGlow = settings.normalGlow ?? 1
  const normalHighlight = settings.normalHighlight ?? 1
  const normalPulseAmount = settings.normalPulse ?? 1
  const normalFlowSpeed = settings.normalFlowSpeed ?? 1
  const largeTrailLength = settings.largeTrailLength ?? 0.24
  const largeGlow = settings.largeGlow ?? 1
  const largeDotScale = settings.largeDotScale ?? 1
  const normalPulse = 1 + (tx.breathAlpha - 0.5) * normalPulseAmount

  ctx.save()
  ctx.lineCap = "round"
  if (tx.phase === "arriving") {
    drawSurfacePulse(ctx, from, cx, cy, radius, phi, theta, easeOutCubic(clamp((now - tx.phaseStartedAt) / ARRIVING_MS, 0, 1)), "rgba(251,191,36,1)")
  } else if (tx.phase === "flying") {
    const head = clamp(tx.flightProgress, 0, 1)
    ctx.strokeStyle = `rgba(70,93,130,${0.08 * alphaBase})`
    ctx.lineWidth = 0.55 + weight * 0.35
    drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, 1, 42)
    ctx.stroke()

    const tail = Math.max(0, head - largeTrailLength)
    ctx.strokeStyle = `rgba(251,191,36,${0.72 * alphaBase * largeGlow})`
    ctx.lineWidth = (1.2 + weight * 1.8) * largeDotScale
    ctx.shadowColor = "rgba(251,191,36,0.6)"
    ctx.shadowBlur = (12 + weight * 12) * largeGlow
    drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, tail, head, 32)
    ctx.stroke()

    const dot = rotatePoint(liftedPoint(from, to, head, height), phi, theta)
    if (dot[2] > -0.05) {
      const [x, y] = project(dot, cx, cy, radius)
      drawGlow(ctx, x, y, (14 + weight * 12) * largeGlow, "rgba(255,248,231,0.95)")
      ctx.fillStyle = "rgba(255,248,231,0.98)"
      ctx.beginPath()
      ctx.arc(x, y, (2.4 + weight * 1.8) * largeDotScale, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (tx.phase === "landing") {
    const progress = clamp((now - tx.phaseStartedAt) / LANDING_MS, 0, 1)
    ctx.strokeStyle = `rgba(245,158,11,${0.14 * (1 - progress) * alphaBase})`
    ctx.lineWidth = 1 + weight
    drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, 1, 36)
    ctx.stroke()
    drawSurfacePulse(ctx, to, cx, cy, radius, phi, theta, easeOutCubic(progress), "rgba(103,232,249,1)")
  } else if (tx.phase === "drawing") {
    const head = easeInOutQuad(clamp((now - tx.phaseStartedAt) / settings.drawDuration, 0, 1))

    ctx.strokeStyle = `rgba(32,128,164,${0.12 * alphaBase * normalGlow})`
    ctx.lineWidth = 0.75 * normalLineWidth
    ctx.shadowColor = "rgba(103,232,249,0.18)"
    ctx.shadowBlur = 5 * normalGlow
    drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, head, 26)
    ctx.stroke()

    ctx.strokeStyle = `rgba(138,249,255,${0.38 * alphaBase * normalHighlight})`
    ctx.lineWidth = (0.55 + weight * 0.22) * normalLineWidth
    ctx.shadowColor = "rgba(103,232,249,0.42)"
    ctx.shadowBlur = 8 * normalGlow
    drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, Math.max(0, head - 0.18), head, 18)
    ctx.stroke()
  } else {
    const fade = tx.phase === "fading" ? 1 - clamp((now - tx.phaseStartedAt) / FADING_MS, 0, 1) : 1
    if (tx.isLarge) {
      ctx.strokeStyle = `rgba(56,189,248,${0.34 * tx.breathAlpha * fade * alphaBase * 1.45})`
      ctx.lineWidth = 0.8 + weight * 1.1
      drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, 1, 34)
      ctx.stroke()

      const source = projectedSurface(from, cx, cy, radius, phi, theta)
      const target = projectedSurface(to, cx, cy, radius, phi, theta)
      ctx.fillStyle = `rgba(56,189,248,${0.55 * fade * alphaBase})`
      for (const p of [source, target]) {
        if (!p) continue
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8 + weight, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      const pulse = clamp(0.45 + 0.55 * normalPulse, 0.15, 1.8)
      const flowCycle = 5200 / clamp(normalFlowSpeed, 0.1, 5)
      const flowHead = ((now + shimmerSeed) % flowCycle) / flowCycle
      const flowTail = Math.max(0, flowHead - 0.16)

      ctx.strokeStyle = `rgba(35,105,145,${0.18 * pulse * fade * alphaBase * normalGlow})`
      ctx.lineWidth = (0.58 + weight * 0.16) * normalLineWidth
      ctx.shadowColor = "rgba(56,189,248,0.2)"
      ctx.shadowBlur = 5 * normalGlow
      drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, 1, 22)
      ctx.stroke()

      ctx.strokeStyle = `rgba(126,244,255,${0.24 * pulse * fade * alphaBase * normalHighlight})`
      ctx.lineWidth = (0.42 + weight * 0.14) * normalLineWidth
      ctx.shadowColor = "rgba(103,232,249,0.34)"
      ctx.shadowBlur = 9 * normalGlow
      drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, flowTail, flowHead, 14)
      ctx.stroke()

      if (flowHead < 0.16) {
        ctx.globalAlpha = flowHead / 0.16
        drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, height, 0, flowHead, 8)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }
  ctx.restore()
}

function drawSelectedRoute(
  ctx: CanvasRenderingContext2D,
  tx: Transaction,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  settings: GlobeSettingsState,
  now: number,
) {
  const from = toVec3(tx.source.lat, tx.source.lng)
  const to = toVec3(tx.target.lat, tx.target.lng)
  const phase = ((now % 3600) / 3600)
  ctx.save()
  ctx.lineCap = "round"
  ctx.strokeStyle = "rgba(255,42,42,0.35)"
  ctx.lineWidth = 1.6
  drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, settings.arcHeight * 0.9, 0, 1, 42)
  ctx.stroke()
  ctx.strokeStyle = "rgba(255,224,77,0.92)"
  ctx.lineWidth = 3
  ctx.shadowColor = "rgba(255,42,42,0.75)"
  ctx.shadowBlur = 18
  drawLiftedArc(ctx, from, to, cx, cy, radius, phi, theta, settings.arcHeight * 0.9, Math.max(0, phase - 0.22), phase, 32)
  ctx.stroke()
  drawSurfacePulse(ctx, from, cx, cy, radius, phi, theta, (phase * 1.8) % 1, "rgba(255,70,55,1)")
  drawSurfacePulse(ctx, to, cx, cy, radius, phi, theta, (phase * 1.8 + 0.45) % 1, "rgba(103,232,249,1)")
  ctx.restore()
}

function drawFlightScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
  progress: number,
  success: number,
  selected: Transaction,
) {
  const cx = width * 0.5
  const cy = height * 0.46
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.72)
  bg.addColorStop(0, "rgba(255, 40, 30, 0.12)")
  bg.addColorStop(0.45, "rgba(10, 4, 6, 0.95)")
  bg.addColorStop(1, "rgba(6, 2, 3, 1)")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  for (let i = 0; i < 44; i += 1) {
    const angle = (i / 44) * Math.PI * 2
    const phase = (now * 0.002 + i * 0.09 + progress * 3) % 1
    const inner = 18 + phase * 56
    const outer = inner + 42 + (1 - phase) * 240
    const alpha = (1 - phase) * 0.32
    ctx.strokeStyle = i % 4 === 0 ? `rgba(255,80,60,${alpha})` : `rgba(255,180,160,${alpha * 0.5})`
    ctx.lineWidth = 1 + (1 - phase) * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner)
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer)
    ctx.stroke()
  }
  const arrival = Math.max(0, (progress - 0.7) / 0.3)
  drawGlow(ctx, cx, cy, 22 + arrival * 90 + success * 120, success > 0 ? `rgba(74,222,128,${0.45 + success * 0.5})` : `rgba(255,60,40,${0.22 + arrival * 0.45})`)
  ctx.restore()

  ctx.fillStyle = `rgba(255,206,200,${0.75 + arrival * 0.25})`
  ctx.font = "800 14px 'JetBrains Mono', monospace"
  ctx.textAlign = "center"
  ctx.fillText(selected.target.city.toUpperCase(), cx, cy - 50 - arrival * 20)
  ctx.fillStyle = "rgba(255,150,130,0.55)"
  ctx.font = "500 11px 'JetBrains Mono', monospace"
  ctx.fillText(`${Math.round(progress * 100)}% ROUTE TRAVERSED`, cx, height - 50)

  if (success > 0) {
    ctx.fillStyle = `rgba(74,222,128,${success})`
    ctx.font = "800 28px 'JetBrains Mono', monospace"
    ctx.fillText("SETTLEMENT CONFIRMED", cx, cy + 80)
    ctx.fillStyle = `rgba(74,222,128,${success * 0.7})`
    ctx.font = "700 18px 'JetBrains Mono', monospace"
    ctx.fillText("決済完了", cx, cy + 110)
  }
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const pixelWidth = Math.max(1, Math.floor(width * dpr))
  const pixelHeight = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
}

export function GlobeCanvas({
  transactions,
  selected,
  mode,
  flightStartedAt,
  onFlightDone,
  globeSettings,
  phiRef,
  thetaRef,
}: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)
  const latestRef = useRef({ transactions, selected, mode, flightStartedAt, onFlightDone, globeSettings })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startPhi: 0, startTheta: 0, velocity: 0, lastX: 0, lastT: 0 })
  const flowsRef = useRef<FlowTx[]>([])
  const lastAddRef = useRef(0)
  const landPoints = useMemo(() => createLandPoints(), [])

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, flightStartedAt, onFlightDone, globeSettings }
    if (mode === "flight") doneRef.current = false
  }, [flightStartedAt, globeSettings, mode, onFlightDone, selected, transactions])

  useEffect(() => {
    const nodes = buildNodes(latestRef.current.transactions)
    const now = performance.now()
    const settings = latestRef.current.globeSettings
    flowsRef.current = Array.from({ length: Math.min(120, settings.flowCount) }, (_, index) => {
      const largeCount = flowsRef.current.filter((tx) => tx.isLarge).length
      const tx = createFlow(now - index * 67, nodes, settings, largeCount, true)
      tx.breathAlpha = 0.25 + Math.random() * 0.75
      return tx
    })
    lastAddRef.current = now
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handlePointerDown = (event: PointerEvent) => {
      if (latestRef.current.mode === "flight" || latestRef.current.mode === "success") return
      dragRef.current = { active: true, startX: event.clientX, startY: event.clientY, startPhi: phiRef.current, startTheta: thetaRef.current, velocity: 0, lastX: event.clientX, lastT: performance.now() }
      canvas.setPointerCapture(event.pointerId)
      canvas.classList.add("is-dragging")
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag.active) return
      const width = Math.max(1, canvas.clientWidth)
      const now = performance.now()
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      phiRef.current = drag.startPhi + (dx / width) * Math.PI * 2
      thetaRef.current = clamp(drag.startTheta + dy * 0.004, -Math.PI / 2.4, Math.PI / 2.4)
      drag.velocity = ((event.clientX - drag.lastX) / Math.max(16, now - drag.lastT)) * 0.018
      drag.lastX = event.clientX
      drag.lastT = now
    }
    const stopDrag = (event: PointerEvent) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      canvas.classList.remove("is-dragging")
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }

    canvas.addEventListener("pointerdown", handlePointerDown)
    canvas.addEventListener("pointermove", handlePointerMove)
    canvas.addEventListener("pointerup", stopDrag)
    canvas.addEventListener("pointercancel", stopDrag)

    let raf = 0
    const render = () => {
      const parent = canvas.parentElement
      if (!parent) {
        raf = requestAnimationFrame(render)
        return
      }

      const width = Math.max(1, Math.floor(parent.clientWidth))
      const height = Math.max(1, Math.floor(parent.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      resizeCanvas(canvas, width, height, dpr)

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        raf = requestAnimationFrame(render)
        return
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = "#02040c"
      ctx.fillRect(0, 0, width, height)

      const current = latestRef.current
      const now = performance.now()
      const elapsed = current.flightStartedAt ? now - current.flightStartedAt : 0
      const rawFlight = current.mode === "flight" || current.mode === "success" ? Math.min(elapsed / FLIGHT_DURATION, 1) : 0
      const success = current.mode === "success" ? Math.min((elapsed - FLIGHT_DURATION) / 1200, 1) : 0

      if ((current.mode === "flight" || current.mode === "success") && rawFlight > 0.08) {
        drawFlightScene(ctx, width, height, now, easeInOutQuad((rawFlight - 0.08) / 0.92), success, current.selected)
        if (rawFlight >= 1 && current.mode === "flight" && !doneRef.current) {
          doneRef.current = true
          current.onFlightDone()
        }
        raf = requestAnimationFrame(render)
        return
      }

      const drag = dragRef.current
      if (!drag.active) {
        if (current.mode === "focus") {
          const midLng = (current.selected.source.lng + current.selected.target.lng) / 2
          const midLat = (current.selected.source.lat + current.selected.target.lat) / 2
          const targetPhi = -midLng * (Math.PI / 180)
          const targetTheta = clamp(midLat * (Math.PI / 180) * 0.72, -0.75, 0.75)
          let delta = targetPhi - phiRef.current
          delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
          phiRef.current += delta * 0.045
          thetaRef.current += (targetTheta - thetaRef.current) * 0.045
        } else {
          phiRef.current += current.globeSettings.rotateSpeed + drag.velocity
        }
        drag.velocity *= 0.94
        if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
      }

      const nodes = buildNodes(current.transactions)
      updateFlows(now, flowsRef.current, nodes, current.globeSettings, lastAddRef)
      const cx = width * 0.5
      const cy = height * 0.5
      const radius = Math.min(width, height) * 0.43
      drawGlobeShell(ctx, cx, cy, radius, phiRef.current, thetaRef.current, landPoints, current.globeSettings.showGrid)

      const flows = flowsRef.current
        .slice(0, clamp(Math.round(current.globeSettings.flowCount), 20, MAX_FLOWS))
        .sort((a, b) => a.amount - b.amount)
      for (const flow of flows) {
        const dim = current.mode === "focus" ? 0.44 : 1
        drawFlow(ctx, flow, cx, cy, radius, phiRef.current, thetaRef.current, current.globeSettings, now, dim)
      }

      if (current.mode === "focus" || (current.mode === "flight" && rawFlight <= 0.08)) {
        drawSelectedRoute(ctx, current.selected, cx, cy, radius, phiRef.current, thetaRef.current, current.globeSettings, now)
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      canvas.removeEventListener("pointerdown", handlePointerDown)
      canvas.removeEventListener("pointermove", handlePointerMove)
      canvas.removeEventListener("pointerup", stopDrag)
      canvas.removeEventListener("pointercancel", stopDrag)
    }
  }, [landPoints, phiRef, thetaRef])

  return <canvas ref={canvasRef} className="globe-canvas custom-globe" aria-label="Custom global transaction flow model" />
}
