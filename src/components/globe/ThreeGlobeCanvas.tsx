import { type MutableRefObject, useEffect, useMemo, useRef } from "react"
import { animate } from "animejs"
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import type { Transaction } from "../../data/transactions"
import { FLIGHT_DURATION } from "../../App"
import type { GlobeSettingsState } from "../ArcOverlay"
import {
  MAX_FLOWS, ARRIVING_MS, FLYING_MS, LANDING_MS, FADING_MS, ARC_SEGMENTS,
  FOCUS_SOURCE_MS, FOCUS_LABEL_MS, FOCUS_FLIGHT_MS, FOCUS_TARGET_MS,
  MONITOR_FRAME_MS, INTERACTIVE_FRAME_MS, FULL_PERFORMANCE_FRAME_MS,
  GEOMETRY_UPDATE_MS, GEOMETRY_UPDATE_DRAG_MS, FULL_PERFORMANCE_GEOMETRY_UPDATE_MS,
  EMPTY_SEGMENTS, CAMERA_CORRIDOR_MAX_Y, MAX_VIEW_THETA, EXTRA_NODES,
} from "./lib/constants"
import {
  type Vec3,
  clamp, easeInOutQuad, easeOutCubic,
  toVec3, setVec3FromLatLng, toVector3, copyVec3,
  slerpInto, normalizeVec,
} from "./lib/vec3"
import { isFrontHemisphere } from "./lib/projection"
import { easeRotationToward, solveRotationForScreenPoint } from "./lib/rotation"
import { cameraFocusPointInto, createArcPoints, liftedPoint, liftedPointInto } from "./lib/route"
import { createLandPoints } from "./lib/landPoints"
import {
  makeGlobeMaterial, orientToSurface, positionLabelAtVec,
  createGlowSprite, setSegments, createFatSegments,
  setFatSegments, disposeFatSegments, createGlowTexture,
  drawGlow, drawFlightScene, resizeCanvas,
} from "./lib/three-objects"
import { renderFlowCount, effectiveGlobeSettings } from "./lib/settings"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

type ThreeGlobeCanvasProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  routesReady: boolean
  flightStartedAt: number | null
  onFlightDone: () => void
  globeSettings: GlobeSettingsState
  fullPerformance: boolean
  phiRef: MutableRefObject<number>
  thetaRef: MutableRefObject<number>
}

type FlowPhase = "arriving" | "flying" | "landing" | "drawing" | "breathing" | "fading"
type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
type FocusPhase = "idle" | "approach-source" | "source-label" | "flight" | "target-label"
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
                      flow.isLarge = false
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
  const targetCount = renderFlowCount(settings)
  const activeTransactions = transactions.slice(0, targetCount)
  const activeIds = new Set(activeTransactions.map((tx) => tx.id))
  const transactionById = new Map(activeTransactions.map((tx) => [tx.id, tx]))

  for (const flow of flows) {
    if (!activeIds.has(flow.id) && flow.phase !== "fading") {
      startFlowFade(flow, now)
      continue
    }

    const transaction = transactionById.get(flow.id)
    if (!transaction) continue

    if (flow.status !== transaction.status) {
      flow.status = transaction.status

      if (transaction.status === "failed") {
        cancelFlowAnimations(flow)
        flow.isLarge = false
        flow.phase = "breathing"
        flow.phaseStartedAt = now
        flow.drawProgress = 1
        flow.fadeAlpha = 1
        flow.sourcePulse = 0
        flow.targetPulse = 0
        flow.flightProgress = 0
        flow.breathAlpha = 1
      }
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
      tx.isLarge = false
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

function lineSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, largeOnly: boolean, now: number) {
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

function shimmerSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
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

function seedInitialTransactionFlows(now: number, transactions: Transaction[], settings: GlobeSettingsState) {
  let largeCount = 0
  return transactions.slice(0, renderFlowCount(settings)).map((transaction, index) => {
    const flow = createTransactionFlow(now, transaction, settings, largeCount)
    if (flow.isLarge) largeCount += 1
    const stagger = index * 18 + (hashText(transaction.id) % 260)
    flow.startedAt = now + stagger
    flow.phaseStartedAt = now + stagger
    flow.drawProgress = flow.phase === "drawing" ? 0 : flow.drawProgress
    if (flow.status === "failed") {
      flow.phase = "drawing"
      flow.drawProgress = 0
    }
    flow.breathAlpha = 0.25 + (hashText(`${transaction.id}-breath`) % 75) / 100
    return flow
  })
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

function selectedRouteSegmentsProgress(selected: Transaction, settings: GlobeSettingsState, progress: number, fullRoute = false) {
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

export function ThreeGlobeCanvas({
  transactions,
  selected,
  mode,
  routesReady,
  flightStartedAt,
  onFlightDone,
  globeSettings,
  fullPerformance,
  phiRef,
  thetaRef,
}: ThreeGlobeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const flightCanvasRef = useRef<HTMLCanvasElement>(null)
  const sourceLabelRef = useRef<HTMLDivElement>(null)
  const targetLabelRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef(false)
  const latestRef = useRef({ transactions, selected, mode, routesReady, flightStartedAt, onFlightDone, globeSettings, fullPerformance })
  const dragRef = useRef({ active: false, startX: 0, startY: 0, startPhi: 0, startTheta: 0, velocity: 0, lastX: 0, lastT: 0 })
  const flowsRef = useRef<FlowTx[]>([])
  const routesSeededRef = useRef(false)
  const lastAddRef = useRef(0)
  const focusMotionRef = useRef({ glow: 1, trail: 0, worldDim: 1 })
  const focusSequenceRef = useRef({ selectedId: "", startedAt: 0, phase: "idle" as FocusPhase, progress: 0 })
  const landPoints = useMemo(() => createLandPoints(), [])

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, routesReady, flightStartedAt, onFlightDone, globeSettings, fullPerformance }
    if (mode === "flight") doneRef.current = false
  }, [flightStartedAt, fullPerformance, globeSettings, mode, onFlightDone, routesReady, selected, transactions])

  useEffect(() => {
    const motion = focusMotionRef.current
    const animation = animate(motion, {
      glow: mode === "focus" ? [0.74, 1.38, 1.08] : 1,
      trail: mode === "focus" ? [0, 1] : 0,
      worldDim: mode === "focus" ? 0.035 : 1,
      duration: 720,
      ease: "outExpo",
    })

    return () => animation.cancel()
  }, [mode, selected.id])

  useEffect(() => {
    focusSequenceRef.current = {
      selectedId: mode === "focus" ? selected.id : "",
      startedAt: performance.now(),
      phase: mode === "focus" ? "approach-source" : "idle",
      progress: 0,
    }
    if (sourceLabelRef.current) sourceLabelRef.current.className = "focus-country-label source"
    if (targetLabelRef.current) targetLabelRef.current.className = "focus-country-label target"
  }, [mode, selected.id])

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
    const focusTexture = createGlowTexture("rgba(251,191,36,0.98)")
    const focusDot = createGlowSprite(focusTexture, 0.14, 0.98)
    globeGroup.add(focusDot)
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

    let renderWidth = Math.max(1, Math.floor(host.clientWidth))
    let renderHeight = Math.max(1, Math.floor(host.clientHeight))
    let renderDpr = Math.min(window.devicePixelRatio || 1, 2)
    let flightCanvasDirty = false
    let rendererOpacity = "1"

    const resize = () => {
      renderWidth = Math.max(1, Math.floor(host.clientWidth))
      renderHeight = Math.max(1, Math.floor(host.clientHeight))
      renderDpr = Math.min(window.devicePixelRatio || 1, 2)
      const aspect = renderWidth / renderHeight
      const viewSize = 2.45
      camera.left = (-viewSize * aspect) / 2
      camera.right = (viewSize * aspect) / 2
      camera.top = viewSize / 2
      camera.bottom = -viewSize / 2
      camera.updateProjectionMatrix()
      renderer.setSize(renderWidth, renderHeight, false)
      lineResolution.set(renderWidth, renderHeight)
      resizeCanvas(flightCanvas, renderWidth, renderHeight, renderDpr)
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
      thetaRef.current = clamp(drag.startTheta - dy * 0.004, -MAX_VIEW_THETA, MAX_VIEW_THETA)
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
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      for (const flow of flowsRef.current) cancelFlowAnimations(flow)
    }
    renderer.domElement.addEventListener("webglcontextlost", handleContextLost)

    let raf = 0
    let lastRenderAt = 0
    let lastGeometryUpdate = 0
    let lastArcHeight = latestRef.current.globeSettings.arcHeight
    let lastSourceLabelText = ""
    let lastTargetLabelText = ""
    let lastSourceLabelClass = ""
    let lastTargetLabelClass = ""
    const focusScaleVector = new THREE.Vector3(1, 1, 1)
    const labelProjectVector = new THREE.Vector3()
    const surfaceVector = new THREE.Vector3()
    const pulseWorldPosition = new THREE.Vector3()
    const focusDotVector = new THREE.Vector3()
    const selectedSourceVec: Vec3 = [0, 0, 0]
    const selectedTargetVec: Vec3 = [0, 0, 0]
    const selectedFocusVec: Vec3 = [0, 0, 0]
    const liftedScratchVec: Vec3 = [0, 0, 0]
    const liftedMidpointVec: Vec3 = [0, 0, 0]
    const render = () => {
      if (document.hidden) {
        raf = requestAnimationFrame(render)
        return
      }

      const current = latestRef.current
      const now = performance.now()
      const drag = dragRef.current
      const globeSettings = effectiveGlobeSettings(current.globeSettings, current.fullPerformance)
      const frameInterval = current.fullPerformance
        ? FULL_PERFORMANCE_FRAME_MS
        : current.mode === "focus" || current.mode === "flight" || current.mode === "success" || drag.active
        ? INTERACTIVE_FRAME_MS
        : MONITOR_FRAME_MS
      if (now - lastRenderAt < frameInterval) {
        raf = requestAnimationFrame(render)
        return
      }
      lastRenderAt = now
      const width = renderWidth
      const height = renderHeight

      const elapsed = current.flightStartedAt ? now - current.flightStartedAt : 0
      const rawFlight = current.mode === "flight" || current.mode === "success" ? Math.min(elapsed / FLIGHT_DURATION, 1) : 0
      const success = current.mode === "success" ? Math.min((elapsed - FLIGHT_DURATION) / 1200, 1) : 0
      const tunnelActive = (current.mode === "flight" || current.mode === "success") && rawFlight > 0.08
      const nextRendererOpacity = tunnelActive ? "0" : "1"
      if (rendererOpacity !== nextRendererOpacity) {
        rendererOpacity = nextRendererOpacity
        renderer.domElement.style.opacity = rendererOpacity
      }
      const flightCtx = tunnelActive || flightCanvasDirty ? flightCanvas.getContext("2d") : null
      if (flightCtx && tunnelActive) {
        flightCtx.setTransform(renderDpr, 0, 0, renderDpr, 0, 0)
        flightCtx.clearRect(0, 0, width, height)
        drawFlightScene(flightCtx, width, height, now, easeInOutQuad((rawFlight - 0.08) / 0.92), success, current.selected)
        flightCanvasDirty = true
        if (rawFlight >= 1 && current.mode === "flight" && !doneRef.current) {
          doneRef.current = true
          current.onFlightDone()
        }
        raf = requestAnimationFrame(render)
        return
      } else if (flightCtx && flightCanvasDirty) {
        flightCtx.setTransform(renderDpr, 0, 0, renderDpr, 0, 0)
        flightCtx.clearRect(0, 0, width, height)
        flightCanvasDirty = false
      }

      const focusSequence = focusSequenceRef.current
      let focusFlightProgress = 0
      if (current.mode === "focus") {
        setVec3FromLatLng(selectedSourceVec, current.selected.source.lat, current.selected.source.lng)
        setVec3FromLatLng(selectedTargetVec, current.selected.target.lat, current.selected.target.lng)
        if (focusSequence.selectedId !== current.selected.id) {
          focusSequence.selectedId = current.selected.id
          focusSequence.startedAt = now
          focusSequence.phase = "approach-source"
          focusSequence.progress = 0
        }
        const focusAge = now - focusSequence.startedAt
        if (focusAge < FOCUS_SOURCE_MS) {
          focusSequence.phase = "approach-source"
        } else if (focusAge < FOCUS_SOURCE_MS + FOCUS_LABEL_MS) {
          focusSequence.phase = "source-label"
        } else if (focusAge < FOCUS_SOURCE_MS + FOCUS_LABEL_MS + FOCUS_FLIGHT_MS) {
          focusSequence.phase = "flight"
          focusFlightProgress = easeInOutQuad((focusAge - FOCUS_SOURCE_MS - FOCUS_LABEL_MS) / FOCUS_FLIGHT_MS)
        } else {
          focusSequence.phase = "target-label"
          focusFlightProgress = 1
        }
        focusSequence.progress = focusFlightProgress
      } else {
        focusSequence.phase = "idle"
        focusSequence.progress = 0
      }

      if (!drag.active) {
        if (current.mode === "focus") {
          const focusVec = cameraFocusPointInto(
            selectedFocusVec,
            selectedSourceVec,
            selectedTargetVec,
            focusSequence.progress,
            focusSequence.phase,
          )
          const solved = solveRotationForScreenPoint(focusVec, phiRef.current, thetaRef.current, camera, 1.78, 0, 0.18)
          easeRotationToward(phiRef, thetaRef, solved.phi, solved.theta, focusSequence.phase === "flight" ? 0.16 : 0.09)
        } else {
          phiRef.current += globeSettings.rotateSpeed + drag.velocity
        }
        drag.velocity *= 0.94
        if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
      }

      globeGroup.rotation.set(-thetaRef.current, phiRef.current, 0, "YXZ")
      const focusScaleTarget = current.mode === "focus" ? 1.78 : 1
      focusScaleVector.set(focusScaleTarget, focusScaleTarget, focusScaleTarget)
      globeGroup.scale.lerp(focusScaleVector, 0.06)

      if (current.routesReady) {
        if (!routesSeededRef.current) {
          for (const flow of flowsRef.current) cancelFlowAnimations(flow)
          flowsRef.current = seedInitialTransactionFlows(now, current.transactions, globeSettings)
          routesSeededRef.current = true
          lastAddRef.current = now
          lastGeometryUpdate = 0
        }
        updateFlows(now, flowsRef.current, current.transactions, globeSettings, lastAddRef)
      } else if (flowsRef.current.length > 0) {
        for (const flow of flowsRef.current) cancelFlowAnimations(flow)
        flowsRef.current = []
        routesSeededRef.current = false
      } else {
        routesSeededRef.current = false
      }
      if (Math.abs(globeSettings.arcHeight - lastArcHeight) > 0.001) {
        for (const flow of flowsRef.current) {
          flow.arcPoints = createArcPoints(flow.from.vec, flow.to.vec, globeSettings.arcHeight * flow.arcHeight, ARC_SEGMENTS)
        }
        lastArcHeight = globeSettings.arcHeight
        lastGeometryUpdate = 0
      }

      const shouldUpdateGeometry = now - lastGeometryUpdate > (current.fullPerformance ? FULL_PERFORMANCE_GEOMETRY_UPDATE_MS : drag.active ? GEOMETRY_UPDATE_DRAG_MS : GEOMETRY_UPDATE_MS)
      if (shouldUpdateGeometry) {
        const focusMotion = focusMotionRef.current
        const normalSegments = lineSegmentsFromFlows(flowsRef.current, globeSettings, false, now)
        setFatSegments(normalGlowLines, normalSegments)
        setFatSegments(normalLines, normalSegments)
        setFatSegments(largeLines, lineSegmentsFromFlows(flowsRef.current, globeSettings, true, now))
        setFatSegments(largeTrailLines, largeTrailSegmentsFromFlows(flowsRef.current, globeSettings))
        const failedSegments = failedSegmentsFromFlows(flowsRef.current, globeSettings, now)
        setFatSegments(failedGlowLines, failedSegments)
        setFatSegments(failedLines, failedSegments)
        const shimmerSegments = shimmerSegmentsFromFlows(flowsRef.current, globeSettings, now)
        setFatSegments(shimmerTailLines, shimmerSegments[0])
        setFatSegments(shimmerMidLines, shimmerSegments[1])
        setFatSegments(shimmerHeadLines, shimmerSegments[2])
        const showSelected = current.mode === "focus" || (current.mode === "flight" && rawFlight <= 0.08)
        if (current.mode === "focus") {
          const showFocusRoute = focusSequence.progress > 0.01
          setFatSegments(
            selectedBaseLines,
            showFocusRoute ? selectedRouteSegmentsProgress(current.selected, globeSettings, focusSequence.progress, focusSequence.phase === "target-label") : EMPTY_SEGMENTS,
          )
          setFatSegments(
            selectedLines,
            showFocusRoute && focusSequence.phase !== "target-label" ? selectedRouteSegmentsProgress(current.selected, globeSettings, focusSequence.progress) : EMPTY_SEGMENTS,
          )
        } else {
          setFatSegments(selectedBaseLines, showSelected ? selectedRouteSegments(current.selected, globeSettings, now, focusMotion.trail, true) : EMPTY_SEGMENTS)
          setFatSegments(selectedLines, showSelected ? selectedRouteSegments(current.selected, globeSettings, now, focusMotion.trail) : EMPTY_SEGMENTS)
        }
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
      const normalPulse = 1 + Math.sin(now * 0.0026) * 0.18 * (globeSettings.normalPulse ?? 1)
      gridLines.visible = globeSettings.showGrid
      gridMaterial.opacity = globeSettings.showGrid ? 0.055 * globeSettings.surfaceBrightness : 0
      normalGlowMaterial.opacity = 0.1 * normalPulse * globeSettings.arcBrightness * (globeSettings.normalGlow ?? 1) * ambientRouteDim
      normalMaterial.opacity = 0.18 * normalPulse * globeSettings.arcBrightness * (globeSettings.normalGlow ?? 1) * ambientRouteDim
      const shimmerBaseOpacity = normalPulse * globeSettings.arcBrightness * (globeSettings.normalHighlight ?? 1) * ambientRouteDim
      shimmerTailMaterial.opacity = 0.08 * shimmerBaseOpacity
      shimmerMidMaterial.opacity = 0.18 * shimmerBaseOpacity
      shimmerHeadMaterial.opacity = 0.34 * shimmerBaseOpacity
      largeMaterial.opacity = 0.28 * globeSettings.arcBrightness * (globeSettings.largeGlow ?? 1) * ambientRouteDim
      largeTrailMaterial.opacity = 0.68 * globeSettings.arcBrightness * (globeSettings.largeGlow ?? 1) * ambientRouteDim
      const failedPulse = 0.62 + Math.sin(now * 0.0075) * 0.28
      const failedFocusDim = current.mode === "focus" ? 0.08 : 1
      failedGlowMaterial.opacity = failedPulse * globeSettings.arcBrightness * failedFocusDim
      failedMaterial.opacity = clamp(failedPulse + 0.16, 0.72, 1) * globeSettings.arcBrightness * failedFocusDim
      normalGlowMaterial.linewidth = 2.1 * (globeSettings.normalLineWidth ?? 1) * (globeSettings.normalGlow ?? 1)
      normalMaterial.linewidth = 0.9 * (globeSettings.normalLineWidth ?? 1)
      shimmerTailMaterial.linewidth = 0.68 * (globeSettings.normalLineWidth ?? 1)
      shimmerMidMaterial.linewidth = 1.0 * (globeSettings.normalLineWidth ?? 1)
      shimmerHeadMaterial.linewidth = 1.38 * (globeSettings.normalLineWidth ?? 1)
      largeMaterial.linewidth = 1.35
      largeTrailMaterial.linewidth = 2.4 * (globeSettings.largeDotScale ?? 1)
      failedGlowMaterial.linewidth = 5.4 + Math.sin(now * 0.0075) * 1.1
      failedMaterial.linewidth = 2.7 + Math.sin(now * 0.0075) * 0.55
      selectedBaseMaterial.opacity = 0.3 * focusMotion.glow
      selectedMaterial.opacity = 0.82 * focusMotion.glow
      selectedBaseMaterial.linewidth = 1.6 + focusMotion.glow * 0.35
      selectedMaterial.linewidth = 2.4 + focusMotion.glow * 0.72
      const globeMaterial = sphere.material as THREE.ShaderMaterial
      globeMaterial.uniforms.brightness.value = globeSettings.surfaceBrightness ?? 1.28
      const landMaterial = land.material as THREE.PointsMaterial
      const coastMaterial = coast.material as THREE.PointsMaterial
      landMaterial.opacity = clamp(0.38 + 0.18 * (globeSettings.landBrightness ?? 1.65), 0.28, 0.9)
      landMaterial.size = 1.15 + 0.62 * clamp(globeSettings.landBrightness ?? 1.65, 0.5, 4)
      coastMaterial.opacity = clamp(0.54 + 0.2 * (globeSettings.landBrightness ?? 1.65), 0.4, 1)
      coastMaterial.size = 1.8 + 0.85 * clamp(globeSettings.landBrightness ?? 1.65, 0.5, 4)

      const sourceLabel = sourceLabelRef.current
      const targetLabel = targetLabelRef.current
      if (sourceLabel && targetLabel) {
        const sourceClass = `focus-country-label source ${current.mode === "focus" && focusSequence.phase !== "approach-source" && focusSequence.phase !== "idle" ? "active" : ""}`
        const targetClass = `focus-country-label target ${current.mode === "focus" && focusSequence.phase === "target-label" ? "active" : ""}`
        if (current.mode === "focus") {
          const sourceText = `${current.selected.source.country.toUpperCase()} // ${current.selected.source.city.toUpperCase()}`
          const targetText = `${current.selected.target.country.toUpperCase()} // ${current.selected.target.city.toUpperCase()}`
          if (sourceText !== lastSourceLabelText) {
            sourceLabel.textContent = sourceText
            lastSourceLabelText = sourceText
          }
          if (targetText !== lastTargetLabelText) {
            targetLabel.textContent = targetText
            lastTargetLabelText = targetText
          }
          positionLabelAtVec(sourceLabel, selectedSourceVec, globeGroup, camera, width, height, labelProjectVector)
          positionLabelAtVec(targetLabel, selectedTargetVec, globeGroup, camera, width, height, labelProjectVector)
        }
        if (sourceClass !== lastSourceLabelClass) {
          sourceLabel.className = sourceClass
          lastSourceLabelClass = sourceClass
        }
        if (targetClass !== lastTargetLabelClass) {
          targetLabel.className = targetClass
          lastTargetLabelClass = targetClass
        }
      }

      focusDot.visible = false
      if (current.mode === "focus" && (focusSequence.phase === "flight" || focusSequence.phase === "target-label")) {
        const point = liftedPointInto(liftedScratchVec, selectedSourceVec, selectedTargetVec, focusSequence.progress, globeSettings.arcHeight * 0.9, liftedMidpointVec)
        focusDot.position.copy(copyVec3(focusDotVector, point, 1))
        focusDot.scale.setScalar(0.11 + Math.sin(now * 0.009) * 0.018)
        ;(focusDot.material as THREE.SpriteMaterial).opacity = focusSequence.phase === "target-label" ? 0.72 : 0.98
        focusDot.visible = true
      }

      let dotIndex = 0
      for (const dot of largeDots) dot.visible = false
      let sourcePulseIndex = 0
      let targetPulseIndex = 0
      for (const pulse of sourcePulses) pulse.visible = false
      for (const pulse of targetPulses) pulse.visible = false
      for (const flow of flowsRef.current) {
        if (current.mode === "focus") continue
        if (flow.status === "failed") continue
        if (!flow.isLarge) continue
        if (flow.phase === "arriving" && sourcePulseIndex < sourcePulses.length) {
          const progress = flow.usesAnime ? flow.sourcePulse : easeOutCubic(clamp((now - flow.phaseStartedAt) / ARRIVING_MS, 0, 1))
          const pulse = sourcePulses[sourcePulseIndex]
          orientToSurface(pulse, flow.from.vec, 1.055, surfaceVector)
          pulse.scale.setScalar((0.08 + progress * 0.22) * (globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.86 * (globeSettings.largeGlow ?? 1), 0, 1)
          pulse.visible = isFrontHemisphere(pulse, pulseWorldPosition)
          sourcePulseIndex += 1
        }
        if (flow.phase === "flying" && dotIndex < largeDots.length) {
          const point = liftedPoint(flow.from.vec, flow.to.vec, flow.flightProgress, globeSettings.arcHeight * flow.arcHeight)
          const dot = largeDots[dotIndex]
          dot.position.copy(copyVec3(focusDotVector, point, 1))
          const scale = (globeSettings.largeDotScale ?? 1) * (0.8 + Math.min(1.8, Math.log10(flow.amount + 1) / 7))
          dot.scale.setScalar(0.08 * scale * (globeSettings.largeGlow ?? 1))
          ;(dot.material as THREE.SpriteMaterial).opacity = 0.96
          dot.visible = true
          dotIndex += 1
        }
        if (flow.phase === "landing" && targetPulseIndex < targetPulses.length) {
          const progress = flow.usesAnime ? flow.targetPulse : easeOutCubic(clamp((now - flow.phaseStartedAt) / LANDING_MS, 0, 1))
          const pulse = targetPulses[targetPulseIndex]
          orientToSurface(pulse, flow.to.vec, 1.055, surfaceVector)
          pulse.scale.setScalar((0.08 + progress * 0.24) * (globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.88 * (globeSettings.largeGlow ?? 1), 0, 1)
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
      renderer.domElement.removeEventListener("webglcontextlost", handleContextLost)
      renderer.dispose()
      sphere.geometry.dispose()
      ;(sphere.material as THREE.Material).dispose()
      landGeometry.dispose()
      ;(land.material as THREE.Material).dispose()
      coastGeometry.dispose()
      ;(coast.material as THREE.Material).dispose()
      for (const line of [
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
      ]) {
        disposeFatSegments(line)
      }
      hotTexture.dispose()
      warmTexture.dispose()
      cyanTexture.dispose()
      focusTexture.dispose()
      ;(focusDot.material as THREE.Material).dispose()
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
      <div ref={sourceLabelRef} className="focus-country-label source" />
      <div ref={targetLabelRef} className="focus-country-label target" />
      <canvas ref={flightCanvasRef} className="flight-layer three-flight-layer" />
    </div>
  )
}
