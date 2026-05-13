import { type MutableRefObject, useEffect, useMemo, useRef } from "react"
import { animate } from "animejs"
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Transaction } from "../data/transactions"
import { naturalEarthLandPoints } from "../data/landPoints"
import { FLIGHT_DURATION } from "../App"
import type { GlobeSettingsState } from "./ArcOverlay"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

type ThreeGlobeCanvasProps = {
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
type LandPoint = { vec: Vec3; seed: number; coast: boolean }
type FlowPhase = "arriving" | "flying" | "landing" | "drawing" | "breathing" | "fading"
type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
type FlowTx = {
  id: string
  status: Transaction["status"]
  from: FlowNode
  to: FlowNode
  amount: number
  isLarge: boolean
  phase: FlowPhase
  startedAt: number
  phaseStartedAt: number
  duration: number
  usesAnime: boolean
  drawProgress: number
  fadeAlpha: number
  sourcePulse: number
  targetPulse: number
  flightProgress: number
  breathAlpha: number
  arcHeight: number
  arcPoints: Vec3[]
  animations: Array<ReturnType<typeof animate>>
}

const MAX_FLOWS = 300
const ARRIVING_MS = 1600
const FLYING_MS = 3200
const LANDING_MS = 1200
const FADING_MS = 1500
const ARC_SEGMENTS = 32

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
    -Math.cos(latRad) * Math.cos(lngRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.sin(lngRad),
  ]
}

function toVector3(vec: Vec3, scale = 1) {
  return new THREE.Vector3(vec[0] * scale, vec[1] * scale, vec[2] * scale)
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

function createArcPoints(from: Vec3, to: Vec3, height: number, segments = ARC_SEGMENTS) {
  const points: Vec3[] = []
  for (let i = 0; i <= segments; i += 1) {
    points.push(liftedPoint(from, to, i / segments, height))
  }
  return points
}

function createLandPoints(): LandPoint[] {
  return naturalEarthLandPoints.map(([lat, lng, source]) => ({
    vec: toVec3(lat, lng),
    seed: Math.abs(Math.sin(lat * 12.9898 + lng * 78.233)),
    coast: source === 1,
  }))
}

function logNormalAmount() {
  const u = 1 - Math.random()
  const v = 1 - Math.random()
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return clamp(Math.exp(Math.log(500_000) + normal * 2.25), 1_000, 500_000_000)
}

function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
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
  const isLarge = amount >= settings.largeThreshold && largeCount < settings.maxLargeAnimated
  const duration = isLarge ? 20_000 + Math.random() * 25_000 : 45_000 + Math.random() * 75_000
  const phase = seedBreathing || (!isLarge && !settings.smallAnimate) ? "breathing" : isLarge ? "arriving" : "drawing"
  const phaseAge = seedBreathing ? Math.random() * duration * 0.7 : 0
  const arcHeight = 0.4 + Math.random() * 0.6

  return {
    id: `F-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    status: "routing",
    from,
    to,
    amount,
    isLarge,
    phase,
    startedAt: now - phaseAge,
    phaseStartedAt: now - phaseAge,
    duration,
    usesAnime: false,
    drawProgress: phase === "drawing" ? 0 : 1,
    fadeAlpha: 1,
    sourcePulse: 0,
    targetPulse: 0,
    flightProgress: 0,
    breathAlpha: 0.4,
    arcHeight,
    arcPoints: createArcPoints(from.vec, to.vec, settings.arcHeight * arcHeight, ARC_SEGMENTS),
    animations: [],
  }
}

function flowNodeFromPoint(point: Transaction["source"]): FlowNode {
  return {
    city: point.city,
    country: point.country,
    lat: point.lat,
    lng: point.lng,
    vec: toVec3(point.lat, point.lng),
  }
}

function flowArcHeight(id: string) {
  return 0.55 + (hashText(id) % 45) / 100
}

function createTransactionFlow(now: number, transaction: Transaction, settings: GlobeSettingsState, largeCount: number): FlowTx {
  const from = flowNodeFromPoint(transaction.source)
  const to = flowNodeFromPoint(transaction.target)
  const amount = Math.max(transaction.source.amount, transaction.target.amount)
  const failed = transaction.status === "failed"
  const isLarge = !failed && amount >= settings.largeThreshold && largeCount < settings.maxLargeAnimated
  const duration = isLarge ? 34_000 : 80_000 + (hashText(transaction.id) % 45_000)
  const phase = failed ? "breathing" : isLarge ? "arriving" : settings.smallAnimate ? "drawing" : "breathing"
  const arcHeight = flowArcHeight(transaction.id)

  return {
    id: transaction.id,
    status: transaction.status,
    from,
    to,
    amount,
    isLarge,
    phase,
    startedAt: now,
    phaseStartedAt: now,
    duration,
    usesAnime: false,
    drawProgress: phase === "drawing" ? 0 : 1,
    fadeAlpha: 1,
    sourcePulse: 0,
    targetPulse: 0,
    flightProgress: 0,
    breathAlpha: 0.4,
    arcHeight,
    arcPoints: createArcPoints(from.vec, to.vec, settings.arcHeight * arcHeight, ARC_SEGMENTS),
    animations: [],
  }
}

function cancelFlowAnimations(flow: FlowTx) {
  for (const animation of flow.animations) animation.cancel()
  flow.animations = []
}

function addFlowAnimation(flow: FlowTx, animation: ReturnType<typeof animate>) {
  flow.animations.push(animation)
  return animation
}

function startBreathingAnimation(flow: FlowTx) {
  addFlowAnimation(
    flow,
    animate(flow, {
      breathAlpha: [0.28, 1],
      duration: 2400,
      loop: true,
      alternate: true,
      ease: "inOutSine",
    }),
  )
}

function startFlowFade(flow: FlowTx, now: number) {
  if (flow.phase === "fading") return
  cancelFlowAnimations(flow)
  flow.phase = "fading"
  flow.phaseStartedAt = now
  flow.fadeAlpha = clamp(flow.fadeAlpha, 0, 1)
  addFlowAnimation(
    flow,
    animate(flow, {
      fadeAlpha: 0,
      duration: FADING_MS,
      ease: "inOutCubic",
    }),
  )
}

function startFlowAnimation(flow: FlowTx, settings: GlobeSettingsState) {
  if (flow.usesAnime) return
  flow.usesAnime = true
  cancelFlowAnimations(flow)

  if (flow.isLarge) {
    flow.phase = "arriving"
    flow.sourcePulse = 0
    flow.flightProgress = 0
    flow.targetPulse = 0
    addFlowAnimation(
      flow,
      animate(flow, {
        sourcePulse: [0, 1],
        duration: ARRIVING_MS,
        ease: "outCubic",
        onComplete: () => {
          flow.phase = "flying"
          flow.phaseStartedAt = performance.now()
          addFlowAnimation(
            flow,
            animate(flow, {
              flightProgress: [0, 1],
              duration: FLYING_MS / clamp(settings.largeFlightSpeed ?? 1, 0.2, 4),
              ease: "inOutQuad",
              onComplete: () => {
                flow.phase = "landing"
                flow.phaseStartedAt = performance.now()
                addFlowAnimation(
                  flow,
                  animate(flow, {
                    targetPulse: [0, 1],
                    duration: LANDING_MS,
                    ease: "outCubic",
                    onComplete: () => {
                      flow.phase = "breathing"
                      flow.phaseStartedAt = performance.now()
                      startBreathingAnimation(flow)
                    },
                  }),
                )
              },
            }),
          )
        },
      }),
    )
    return
  }

  if (flow.phase === "drawing") {
    flow.drawProgress = 0
    addFlowAnimation(
      flow,
      animate(flow, {
        drawProgress: [0, 1],
        duration: settings.drawDuration,
        ease: "inOutQuad",
        onComplete: () => {
          flow.phase = "breathing"
          flow.phaseStartedAt = performance.now()
          startBreathingAnimation(flow)
        },
      }),
    )
  } else if (flow.phase === "breathing") {
    startBreathingAnimation(flow)
  }
}

function updateFlows(now: number, flows: FlowTx[], transactions: Transaction[], settings: GlobeSettingsState, lastAddRef: MutableRefObject<number>) {
  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
  const activeTransactions = transactions.slice(0, targetCount)
  const activeIds = new Set(activeTransactions.map((tx) => tx.id))

  for (const flow of flows) {
    if (!activeIds.has(flow.id) && flow.phase !== "fading") {
      startFlowFade(flow, now)
    }
  }

  let largeCount = flows.filter((tx) => tx.isLarge && tx.phase !== "fading").length
  for (const transaction of activeTransactions) {
    if (flows.some((flow) => flow.id === transaction.id)) continue
    const flow = createTransactionFlow(now, transaction, settings, largeCount)
    if (flow.isLarge) largeCount += 1
    startFlowAnimation(flow, settings)
    flows.unshift(flow)
    lastAddRef.current = now
  }

  for (const tx of flows) {
    if (tx.usesAnime) continue

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
    if (flows[i].phase === "fading" && (flows[i].fadeAlpha <= 0.03 || now - flows[i].phaseStartedAt > FADING_MS)) {
      cancelFlowAnimations(flows[i])
      flows.splice(i, 1)
    }
  }
}

function makeGlobeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    depthTest: true,
    uniforms: {
      frontColor: { value: new THREE.Color("#27699d") },
      midColor: { value: new THREE.Color("#123765") },
      edgeColor: { value: new THREE.Color("#06152f") },
      brightness: { value: 1.75 },
    },
    vertexShader: `
      varying vec3 vNormalView;
      void main() {
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 frontColor;
      uniform vec3 midColor;
      uniform vec3 edgeColor;
      uniform float brightness;
      varying vec3 vNormalView;
      void main() {
        float facing = clamp(vNormalView.z * 0.5 + 0.5, 0.0, 1.0);
        vec3 color = mix(edgeColor, midColor, smoothstep(0.0, 0.72, facing));
        color = mix(color, frontColor, smoothstep(0.58, 1.0, facing) * 0.72);
        color *= brightness;
        color += vec3(0.015, 0.035, 0.07);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

function lineSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, largeOnly: boolean, now: number) {
  const positions: number[] = []
  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
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

function shimmerSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
  const tailPositions: number[] = []
  const midPositions: number[] = []
  const headPositions: number[] = []
  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
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

function largeTrailSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState) {
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

function failedSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
  const positions: number[] = []
  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
  for (const flow of flows.slice(0, targetCount)) {
    if (flow.status !== "failed") continue
    const fade = flow.phase === "fading" ? 1 - clamp((now - flow.phaseStartedAt) / FADING_MS, 0, 1) : flow.fadeAlpha
    if (fade <= 0.03) continue
    for (let i = 0; i < flow.arcPoints.length - 1; i += 1) {
      const a = flow.arcPoints[i]
      const b = flow.arcPoints[i + 1]
      positions.push(a[0], a[1], a[2], b[0], b[1], b[2])
    }
  }
  return new Float32Array(positions)
}

function selectedRouteSegments(selected: Transaction, settings: GlobeSettingsState, now: number, trailBoost = 0, fullRoute = false) {
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

function gridSegments() {
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

function orientToSurface(mesh: THREE.Object3D, vec: Vec3, radius = 1.01) {
  const normal = toVector3(vec, 1).normalize()
  mesh.position.copy(normal.multiplyScalar(radius))
}

function createGlowSprite(texture: THREE.Texture, size: number, opacity: number, depthTest = true) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.setScalar(size)
  sprite.visible = false
  return sprite
}

function setSegments(line: THREE.LineSegments, positions: Float32Array) {
  const old = line.geometry
  line.geometry = new THREE.BufferGeometry()
  line.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  old.dispose()
}

function createFatSegments(color: string, opacity: number, linewidth: number, resolution: THREE.Vector2) {
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions([])
  const material = new LineMaterial({
    color,
    linewidth,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    resolution,
  })
  return new LineSegments2(geometry, material)
}

function setFatSegments(line: LineSegments2, positions: Float32Array) {
  const old = line.geometry
  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(Array.from(positions))
  line.geometry = geometry
  old.dispose()
}

function isFrontHemisphere(object: THREE.Object3D, target = new THREE.Vector3()) {
  object.getWorldPosition(target)
  return target.z > -0.04
}

function createGlowTexture(color: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext("2d")
  if (!ctx) return new THREE.Texture()
  const gradient = ctx.createRadialGradient(48, 48, 0, 48, 48, 48)
  gradient.addColorStop(0, "rgba(255,255,255,1)")
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(0.55, color.replace(/[\d.]+\)$/, "0.22)"))
  gradient.addColorStop(1, "rgba(0,0,0,0)")
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 96, 96)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
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

export function ThreeGlobeCanvas({
  transactions,
  selected,
  mode,
  flightStartedAt,
  onFlightDone,
  globeSettings,
  phiRef,
  thetaRef,
}: ThreeGlobeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const flightCanvasRef = useRef<HTMLCanvasElement>(null)
  const doneRef = useRef(false)
  const latestRef = useRef({ transactions, selected, mode, flightStartedAt, onFlightDone, globeSettings })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startPhi: 0, startTheta: 0, velocity: 0, lastX: 0, lastT: 0 })
  const flowsRef = useRef<FlowTx[]>([])
  const lastAddRef = useRef(0)
  const focusMotionRef = useRef({ glow: 1, trail: 0, worldDim: 1 })
  const landPoints = useMemo(() => createLandPoints(), [])

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, flightStartedAt, onFlightDone, globeSettings }
    if (mode === "flight") doneRef.current = false
  }, [flightStartedAt, globeSettings, mode, onFlightDone, selected, transactions])

  useEffect(() => {
    const motion = focusMotionRef.current
    const animation = animate(motion, {
      glow: mode === "focus" ? [0.74, 1.38, 1.08] : 1,
      trail: mode === "focus" ? [0, 1] : 0,
      worldDim: mode === "focus" ? 0.74 : 1,
      duration: 720,
      ease: "outExpo",
    })

    return () => animation.cancel()
  }, [mode, selected.id])

  useEffect(() => {
    const settings = latestRef.current.globeSettings
    const now = performance.now()
    let largeCount = 0
    flowsRef.current = latestRef.current.transactions.slice(0, Math.min(MAX_FLOWS, settings.flowCount)).map((transaction, index) => {
      const flow = createTransactionFlow(now - index * 67, transaction, settings, largeCount)
      if (flow.isLarge) largeCount += 1
      flow.phase = "breathing"
      flow.drawProgress = 1
      flow.breathAlpha = 0.25 + Math.random() * 0.75
      return flow
    })
    lastAddRef.current = now
  }, [])

  useEffect(() => {
    const host = hostRef.current
    const flightCanvas = flightCanvasRef.current
    if (!host || !flightCanvas) return

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 3

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    renderer.setClearColor(0x02040c, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.domElement.className = "three-globe-layer"
    host.prepend(renderer.domElement)

    const globeGroup = new THREE.Group()
    scene.add(globeGroup)

    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), makeGlobeMaterial())
    globeGroup.add(sphere)

    const fillPoints = landPoints.filter((point) => !point.coast)
    const coastPoints = landPoints.filter((point) => point.coast)
    const landPositions = new Float32Array(fillPoints.length * 3)
    const landColors = new Float32Array(fillPoints.length * 3)
    fillPoints.forEach((point, index) => {
      const v = toVector3(point.vec, 1.007)
      landPositions[index * 3] = v.x
      landPositions[index * 3 + 1] = v.y
      landPositions[index * 3 + 2] = v.z
      const color = new THREE.Color(point.seed > 0.48 ? "#62a46f" : "#3e7d65")
      landColors[index * 3] = color.r
      landColors[index * 3 + 1] = color.g
      landColors[index * 3 + 2] = color.b
    })
    const coastPositions = new Float32Array(coastPoints.length * 3)
    const coastColors = new Float32Array(coastPoints.length * 3)
    coastPoints.forEach((point, index) => {
      const v = toVector3(point.vec, 1.012)
      coastPositions[index * 3] = v.x
      coastPositions[index * 3 + 1] = v.y
      coastPositions[index * 3 + 2] = v.z
      const color = new THREE.Color(point.seed > 0.45 ? "#8fd79a" : "#6fbf88")
      coastColors[index * 3] = color.r
      coastColors[index * 3 + 1] = color.g
      coastColors[index * 3 + 2] = color.b
    })
    const landGeometry = new THREE.BufferGeometry()
    landGeometry.setAttribute("position", new THREE.BufferAttribute(landPositions, 3))
    landGeometry.setAttribute("color", new THREE.BufferAttribute(landColors, 3))
    const land = new THREE.Points(
      landGeometry,
      new THREE.PointsMaterial({
        size: 2.2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.88,
        vertexColors: true,
        depthWrite: false,
      }),
    )
    globeGroup.add(land)
    const coastGeometry = new THREE.BufferGeometry()
    coastGeometry.setAttribute("position", new THREE.BufferAttribute(coastPositions, 3))
    coastGeometry.setAttribute("color", new THREE.BufferAttribute(coastColors, 3))
    const coast = new THREE.Points(
      coastGeometry,
      new THREE.PointsMaterial({
        size: 2.8,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.95,
        vertexColors: true,
        depthWrite: false,
      }),
    )
    globeGroup.add(coast)

    const lineResolution = new THREE.Vector2(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight))
    const gridLines = createFatSegments("#6bb7ff", 0.06, 0.65, lineResolution)
    setFatSegments(gridLines, gridSegments())
    const normalGlowLines = createFatSegments("#1c7ea5", 0.1, 2.2, lineResolution)
    const normalLines = createFatSegments("#236991", 0.18, 1.05, lineResolution)
    const shimmerTailLines = createFatSegments("#38bdf8", 0.09, 0.7, lineResolution)
    const shimmerMidLines = createFatSegments("#67e8f9", 0.18, 1.05, lineResolution)
    const shimmerHeadLines = createFatSegments("#f5feff", 0.34, 1.45, lineResolution)
    const largeLines = createFatSegments("#38bdf8", 0.32, 1.6, lineResolution)
    const largeTrailLines = createFatSegments("#fbbf24", 0.72, 3.1, lineResolution)
    const failedGlowLines = createFatSegments("#ff1f1f", 0.7, 5.2, lineResolution)
    const failedLines = createFatSegments("#ff5555", 0.95, 2.8, lineResolution)
    const selectedBaseLines = createFatSegments("#00e5ff", 0.34, 2.1, lineResolution)
    const selectedLines = createFatSegments("#fbbf24", 0.92, 3.4, lineResolution)
    globeGroup.add(
      gridLines,
      normalGlowLines,
      normalLines,
      shimmerTailLines,
      shimmerMidLines,
      shimmerHeadLines,
      largeLines,
      largeTrailLines,
      failedGlowLines,
      failedLines,
      selectedBaseLines,
      selectedLines,
    )

    const hotTexture = createGlowTexture("rgba(255,248,231,0.95)")
    const warmTexture = createGlowTexture("rgba(251,191,36,0.95)")
    const cyanTexture = createGlowTexture("rgba(103,232,249,0.95)")
    const largeDots = Array.from({ length: 20 }, () => {
      const dot = createGlowSprite(hotTexture, 0.12, 0.96)
      globeGroup.add(dot)
      return dot
    })
    const sourcePulses = Array.from({ length: 20 }, () => {
      const pulse = createGlowSprite(warmTexture, 0.16, 0, false)
      globeGroup.add(pulse)
      return pulse
    })
    const targetPulses = Array.from({ length: 20 }, () => {
      const pulse = createGlowSprite(cyanTexture, 0.16, 0, false)
      globeGroup.add(pulse)
      return pulse
    })

    const resize = () => {
      const width = Math.max(1, Math.floor(host.clientWidth))
      const height = Math.max(1, Math.floor(host.clientHeight))
      const aspect = width / height
      const viewSize = 2.45
      camera.left = (-viewSize * aspect) / 2
      camera.right = (viewSize * aspect) / 2
      camera.top = viewSize / 2
      camera.bottom = -viewSize / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      lineResolution.set(width, height)
      resizeCanvas(flightCanvas, width, height, Math.min(window.devicePixelRatio || 1, 2))
    }

    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const handlePointerDown = (event: PointerEvent) => {
      const current = latestRef.current
      if (current.mode === "flight" || current.mode === "success") return
      dragRef.current = { active: true, startX: event.clientX, startY: event.clientY, startPhi: phiRef.current, startTheta: thetaRef.current, velocity: 0, lastX: event.clientX, lastT: performance.now() }
      host.setPointerCapture(event.pointerId)
      host.classList.add("is-dragging")
    }
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag.active) return
      const width = Math.max(1, host.clientWidth)
      const now = performance.now()
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      phiRef.current = drag.startPhi + (dx / width) * Math.PI * 2
      thetaRef.current = clamp(drag.startTheta - dy * 0.004, -Math.PI / 2.4, Math.PI / 2.4)
      drag.velocity = ((event.clientX - drag.lastX) / Math.max(16, now - drag.lastT)) * 0.018
      drag.lastX = event.clientX
      drag.lastT = now
    }
    const stopDrag = (event: PointerEvent) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      host.classList.remove("is-dragging")
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId)
    }

    host.addEventListener("pointerdown", handlePointerDown)
    host.addEventListener("pointermove", handlePointerMove)
    host.addEventListener("pointerup", stopDrag)
    host.addEventListener("pointercancel", stopDrag)

    let raf = 0
    let lastGeometryUpdate = 0
    let lastArcHeight = latestRef.current.globeSettings.arcHeight
    const render = () => {
      const current = latestRef.current
      const now = performance.now()
      const width = Math.max(1, Math.floor(host.clientWidth))
      const height = Math.max(1, Math.floor(host.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const flightCtx = flightCanvas.getContext("2d")
      if (flightCtx) {
        flightCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
        flightCtx.clearRect(0, 0, width, height)
      }

      const elapsed = current.flightStartedAt ? now - current.flightStartedAt : 0
      const rawFlight = current.mode === "flight" || current.mode === "success" ? Math.min(elapsed / FLIGHT_DURATION, 1) : 0
      const success = current.mode === "success" ? Math.min((elapsed - FLIGHT_DURATION) / 1200, 1) : 0
      const tunnelActive = (current.mode === "flight" || current.mode === "success") && rawFlight > 0.08
      renderer.domElement.style.opacity = tunnelActive ? "0" : "1"
      if (flightCtx && tunnelActive) {
        drawFlightScene(flightCtx, width, height, now, easeInOutQuad((rawFlight - 0.08) / 0.92), success, current.selected)
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
          const targetPhi = Math.PI / 2 - midLng * (Math.PI / 180)
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

      globeGroup.rotation.set(-thetaRef.current, phiRef.current, 0, "YXZ")

      updateFlows(now, flowsRef.current, current.transactions, current.globeSettings, lastAddRef)
      if (Math.abs(current.globeSettings.arcHeight - lastArcHeight) > 0.001) {
        for (const flow of flowsRef.current) {
          flow.arcPoints = createArcPoints(flow.from.vec, flow.to.vec, current.globeSettings.arcHeight * flow.arcHeight, ARC_SEGMENTS)
        }
        lastArcHeight = current.globeSettings.arcHeight
        lastGeometryUpdate = 0
      }

      const shouldUpdateGeometry = now - lastGeometryUpdate > (drag.active ? 260 : 90)
      if (shouldUpdateGeometry) {
        const focusMotion = focusMotionRef.current
        const normalSegments = lineSegmentsFromFlows(flowsRef.current, current.globeSettings, false, now)
        setFatSegments(normalGlowLines, normalSegments)
        setFatSegments(normalLines, normalSegments)
        setFatSegments(largeLines, lineSegmentsFromFlows(flowsRef.current, current.globeSettings, true, now))
        setFatSegments(largeTrailLines, largeTrailSegmentsFromFlows(flowsRef.current, current.globeSettings))
        const failedSegments = failedSegmentsFromFlows(flowsRef.current, current.globeSettings, now)
        setFatSegments(failedGlowLines, failedSegments)
        setFatSegments(failedLines, failedSegments)
        const shimmerSegments = shimmerSegmentsFromFlows(flowsRef.current, current.globeSettings, now)
        setFatSegments(shimmerTailLines, shimmerSegments[0])
        setFatSegments(shimmerMidLines, shimmerSegments[1])
        setFatSegments(shimmerHeadLines, shimmerSegments[2])
        const showSelected = current.mode === "focus" || (current.mode === "flight" && rawFlight <= 0.08)
        setFatSegments(selectedBaseLines, showSelected ? selectedRouteSegments(current.selected, current.globeSettings, now, focusMotion.trail, true) : new Float32Array())
        setFatSegments(selectedLines, showSelected ? selectedRouteSegments(current.selected, current.globeSettings, now, focusMotion.trail) : new Float32Array())
        lastGeometryUpdate = now
      }

      const normalGlowMaterial = normalGlowLines.material as LineMaterial
      const gridMaterial = gridLines.material as LineMaterial
      const normalMaterial = normalLines.material as LineMaterial
      const shimmerTailMaterial = shimmerTailLines.material as LineMaterial
      const shimmerMidMaterial = shimmerMidLines.material as LineMaterial
      const shimmerHeadMaterial = shimmerHeadLines.material as LineMaterial
      const largeMaterial = largeLines.material as LineMaterial
      const largeTrailMaterial = largeTrailLines.material as LineMaterial
      const failedGlowMaterial = failedGlowLines.material as LineMaterial
      const failedMaterial = failedLines.material as LineMaterial
      const selectedBaseMaterial = selectedBaseLines.material as LineMaterial
      const selectedMaterial = selectedLines.material as LineMaterial
      const focusMotion = focusMotionRef.current
      const ambientRouteDim = current.mode === "focus" ? focusMotion.worldDim : 1
      const normalPulse = 1 + Math.sin(now * 0.0026) * 0.18 * (current.globeSettings.normalPulse ?? 1)
      gridLines.visible = current.globeSettings.showGrid
      gridMaterial.opacity = current.globeSettings.showGrid ? 0.055 * current.globeSettings.surfaceBrightness : 0
      normalGlowMaterial.opacity = 0.1 * normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalGlow ?? 1) * ambientRouteDim
      normalMaterial.opacity = 0.18 * normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalGlow ?? 1) * ambientRouteDim
      const shimmerBaseOpacity = normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalHighlight ?? 1) * ambientRouteDim
      shimmerTailMaterial.opacity = 0.08 * shimmerBaseOpacity
      shimmerMidMaterial.opacity = 0.18 * shimmerBaseOpacity
      shimmerHeadMaterial.opacity = 0.34 * shimmerBaseOpacity
      largeMaterial.opacity = 0.28 * current.globeSettings.arcBrightness * (current.globeSettings.largeGlow ?? 1) * ambientRouteDim
      largeTrailMaterial.opacity = 0.68 * current.globeSettings.arcBrightness * (current.globeSettings.largeGlow ?? 1) * ambientRouteDim
      const failedPulse = 0.62 + Math.sin(now * 0.0075) * 0.28
      failedGlowMaterial.opacity = failedPulse * current.globeSettings.arcBrightness * clamp(ambientRouteDim + 0.25, 0.55, 1.15)
      failedMaterial.opacity = clamp(failedPulse + 0.16, 0.72, 1) * current.globeSettings.arcBrightness * clamp(ambientRouteDim + 0.35, 0.65, 1.2)
      normalGlowMaterial.linewidth = 2.1 * (current.globeSettings.normalLineWidth ?? 1) * (current.globeSettings.normalGlow ?? 1)
      normalMaterial.linewidth = 0.9 * (current.globeSettings.normalLineWidth ?? 1)
      shimmerTailMaterial.linewidth = 0.68 * (current.globeSettings.normalLineWidth ?? 1)
      shimmerMidMaterial.linewidth = 1.0 * (current.globeSettings.normalLineWidth ?? 1)
      shimmerHeadMaterial.linewidth = 1.38 * (current.globeSettings.normalLineWidth ?? 1)
      largeMaterial.linewidth = 1.35
      largeTrailMaterial.linewidth = 2.4 * (current.globeSettings.largeDotScale ?? 1)
      failedGlowMaterial.linewidth = 5.4 + Math.sin(now * 0.0075) * 1.1
      failedMaterial.linewidth = 2.7 + Math.sin(now * 0.0075) * 0.55
      selectedBaseMaterial.opacity = 0.3 * focusMotion.glow
      selectedMaterial.opacity = 0.82 * focusMotion.glow
      selectedBaseMaterial.linewidth = 1.6 + focusMotion.glow * 0.35
      selectedMaterial.linewidth = 2.4 + focusMotion.glow * 0.72
      const globeMaterial = sphere.material as THREE.ShaderMaterial
      globeMaterial.uniforms.brightness.value = current.globeSettings.surfaceBrightness ?? 1.28
      const landMaterial = land.material as THREE.PointsMaterial
      const coastMaterial = coast.material as THREE.PointsMaterial
      landMaterial.opacity = clamp(0.38 + 0.18 * (current.globeSettings.landBrightness ?? 1.65), 0.28, 0.9)
      landMaterial.size = 1.15 + 0.62 * clamp(current.globeSettings.landBrightness ?? 1.65, 0.5, 4)
      coastMaterial.opacity = clamp(0.54 + 0.2 * (current.globeSettings.landBrightness ?? 1.65), 0.4, 1)
      coastMaterial.size = 1.8 + 0.85 * clamp(current.globeSettings.landBrightness ?? 1.65, 0.5, 4)

      let dotIndex = 0
      for (const dot of largeDots) dot.visible = false
      let sourcePulseIndex = 0
      let targetPulseIndex = 0
      for (const pulse of sourcePulses) pulse.visible = false
      for (const pulse of targetPulses) pulse.visible = false
      const pulseWorldPosition = new THREE.Vector3()
      for (const flow of flowsRef.current) {
        if (flow.status === "failed") continue
        if (!flow.isLarge) continue
        if (flow.phase === "arriving" && sourcePulseIndex < sourcePulses.length) {
          const progress = flow.usesAnime ? flow.sourcePulse : easeOutCubic(clamp((now - flow.phaseStartedAt) / ARRIVING_MS, 0, 1))
          const pulse = sourcePulses[sourcePulseIndex]
          orientToSurface(pulse, flow.from.vec, 1.055)
          pulse.scale.setScalar((0.08 + progress * 0.22) * (current.globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.86 * (current.globeSettings.largeGlow ?? 1), 0, 1)
          pulse.visible = isFrontHemisphere(pulse, pulseWorldPosition)
          sourcePulseIndex += 1
        }
        if (flow.phase === "flying" && dotIndex < largeDots.length) {
          const point = liftedPoint(flow.from.vec, flow.to.vec, flow.flightProgress, current.globeSettings.arcHeight * flow.arcHeight)
          const dot = largeDots[dotIndex]
          dot.position.copy(toVector3(point, 1))
          const scale = (current.globeSettings.largeDotScale ?? 1) * (0.8 + Math.min(1.8, Math.log10(flow.amount + 1) / 7))
          dot.scale.setScalar(0.08 * scale * (current.globeSettings.largeGlow ?? 1))
          ;(dot.material as THREE.SpriteMaterial).opacity = 0.96
          dot.visible = true
          dotIndex += 1
        }
        if (flow.phase === "landing" && targetPulseIndex < targetPulses.length) {
          const progress = flow.usesAnime ? flow.targetPulse : easeOutCubic(clamp((now - flow.phaseStartedAt) / LANDING_MS, 0, 1))
          const pulse = targetPulses[targetPulseIndex]
          orientToSurface(pulse, flow.to.vec, 1.055)
          pulse.scale.setScalar((0.08 + progress * 0.24) * (current.globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.88 * (current.globeSettings.largeGlow ?? 1), 0, 1)
          pulse.visible = isFrontHemisphere(pulse, pulseWorldPosition)
          targetPulseIndex += 1
        }
      }

      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      host.removeEventListener("pointerdown", handlePointerDown)
      host.removeEventListener("pointermove", handlePointerMove)
      host.removeEventListener("pointerup", stopDrag)
      host.removeEventListener("pointercancel", stopDrag)
      renderer.dispose()
      sphere.geometry.dispose()
      ;(sphere.material as THREE.Material).dispose()
      landGeometry.dispose()
      ;(land.material as THREE.Material).dispose()
      coastGeometry.dispose()
      ;(coast.material as THREE.Material).dispose()
      gridLines.geometry.dispose()
      normalGlowLines.geometry.dispose()
      normalLines.geometry.dispose()
      shimmerTailLines.geometry.dispose()
      shimmerMidLines.geometry.dispose()
      shimmerHeadLines.geometry.dispose()
      largeLines.geometry.dispose()
      largeTrailLines.geometry.dispose()
      selectedBaseLines.geometry.dispose()
      selectedLines.geometry.dispose()
      ;(gridLines.material as THREE.Material).dispose()
      ;(normalGlowLines.material as THREE.Material).dispose()
      ;(normalLines.material as THREE.Material).dispose()
      ;(shimmerTailLines.material as THREE.Material).dispose()
      ;(shimmerMidLines.material as THREE.Material).dispose()
      ;(shimmerHeadLines.material as THREE.Material).dispose()
      ;(largeLines.material as THREE.Material).dispose()
      ;(largeTrailLines.material as THREE.Material).dispose()
      ;(selectedBaseLines.material as THREE.Material).dispose()
      ;(selectedLines.material as THREE.Material).dispose()
      hotTexture.dispose()
      warmTexture.dispose()
      cyanTexture.dispose()
      for (const dot of largeDots) {
        ;(dot.material as THREE.Material).dispose()
      }
      for (const pulse of [...sourcePulses, ...targetPulses]) {
        ;(pulse.material as THREE.Material).dispose()
      }
      for (const flow of flowsRef.current) cancelFlowAnimations(flow)
      renderer.domElement.remove()
    }
  }, [landPoints, phiRef, thetaRef])

  return (
    <div ref={hostRef} className="globe-canvas three-globe-host" aria-label="Three.js global transaction flow model">
      <canvas ref={flightCanvasRef} className="flight-layer three-flight-layer" />
    </div>
  )
}
