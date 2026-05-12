import { type MutableRefObject, useEffect, useMemo, useRef } from "react"
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
  arcPoints: Vec3[]
}

const MAX_FLOWS = 280
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
    arcHeight,
    arcPoints: createArcPoints(from.vec, to.vec, settings.arcHeight * arcHeight, ARC_SEGMENTS),
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
    if (flow.isLarge !== largeOnly) continue
    const fade = flow.phase === "fading" ? 1 - clamp((now - flow.phaseStartedAt) / FADING_MS, 0, 1) : 1
    if (fade <= 0.03) continue
    if (flow.phase === "arriving" || flow.phase === "landing") continue
    let visiblePoints = flow.arcPoints.length
    if (flow.phase === "drawing") {
      const head = easeInOutQuad(clamp((now - flow.phaseStartedAt) / settings.drawDuration, 0, 1))
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

function shimmerSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState, now: number) {
  const positions: number[] = []
  const targetCount = clamp(Math.round(settings.flowCount), 20, MAX_FLOWS)
  const normalFlowSpeed = settings.normalFlowSpeed ?? 1
  for (const flow of flows.slice(0, targetCount)) {
    if (flow.isLarge || flow.phase === "arriving" || flow.phase === "landing" || flow.phase === "fading") continue
    const cycle = 5200 / clamp(normalFlowSpeed, 0.1, 5)
    const head = ((now + (hashText(flow.id) % 5000)) % cycle) / cycle
    const tail = Math.max(0, head - 0.16)
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

function largeTrailSegmentsFromFlows(flows: FlowTx[], settings: GlobeSettingsState) {
  const positions: number[] = []
  const trailLength = settings.largeTrailLength ?? 0.24
  for (const flow of flows) {
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

function selectedRouteSegments(selected: Transaction, settings: GlobeSettingsState, now: number, fullRoute = false) {
  const from = toVec3(selected.source.lat, selected.source.lng)
  const to = toVec3(selected.target.lat, selected.target.lng)
  const points = createArcPoints(from, to, settings.arcHeight * 0.9, ARC_SEGMENTS)
  const phase = (now % 3600) / 3600
  const start = fullRoute ? 0 : Math.floor(Math.max(0, phase - 0.22) * (points.length - 1))
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

function createGlowSprite(texture: THREE.Texture, size: number, opacity: number) {
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
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
  const landPoints = useMemo(() => createLandPoints(), [])

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, flightStartedAt, onFlightDone, globeSettings }
    if (mode === "flight") doneRef.current = false
  }, [flightStartedAt, globeSettings, mode, onFlightDone, selected, transactions])

  useEffect(() => {
    const settings = latestRef.current.globeSettings
    const nodes = buildNodes(latestRef.current.transactions)
    const now = performance.now()
    flowsRef.current = Array.from({ length: Math.min(120, settings.flowCount) }, (_, index) => {
      const largeCount = flowsRef.current.filter((tx) => tx.isLarge).length
      const tx = createFlow(now - index * 67, nodes, settings, largeCount, true)
      tx.breathAlpha = 0.25 + Math.random() * 0.75
      return tx
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
    const shimmerLines = createFatSegments("#7ef4ff", 0.32, 1.35, lineResolution)
    const largeLines = createFatSegments("#38bdf8", 0.32, 1.6, lineResolution)
    const largeTrailLines = createFatSegments("#fbbf24", 0.72, 3.1, lineResolution)
    const selectedBaseLines = createFatSegments("#ff2a2a", 0.34, 2.1, lineResolution)
    const selectedLines = createFatSegments("#ffe04d", 0.92, 3.4, lineResolution)
    globeGroup.add(gridLines, normalGlowLines, normalLines, shimmerLines, largeLines, largeTrailLines, selectedBaseLines, selectedLines)

    const hotTexture = createGlowTexture("rgba(255,248,231,0.95)")
    const warmTexture = createGlowTexture("rgba(251,191,36,0.95)")
    const cyanTexture = createGlowTexture("rgba(103,232,249,0.95)")
    const largeDots = Array.from({ length: 20 }, () => {
      const dot = createGlowSprite(hotTexture, 0.12, 0.96)
      globeGroup.add(dot)
      return dot
    })
    const sourcePulses = Array.from({ length: 20 }, () => {
      const pulse = createGlowSprite(warmTexture, 0.16, 0)
      globeGroup.add(pulse)
      return pulse
    })
    const targetPulses = Array.from({ length: 20 }, () => {
      const pulse = createGlowSprite(cyanTexture, 0.16, 0)
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

      const nodes = buildNodes(current.transactions)
      updateFlows(now, flowsRef.current, nodes, current.globeSettings, lastAddRef)
      if (Math.abs(current.globeSettings.arcHeight - lastArcHeight) > 0.001) {
        for (const flow of flowsRef.current) {
          flow.arcPoints = createArcPoints(flow.from.vec, flow.to.vec, current.globeSettings.arcHeight * flow.arcHeight, ARC_SEGMENTS)
        }
        lastArcHeight = current.globeSettings.arcHeight
        lastGeometryUpdate = 0
      }

      const shouldUpdateGeometry = now - lastGeometryUpdate > (drag.active ? 260 : 90)
      if (shouldUpdateGeometry) {
        const normalSegments = lineSegmentsFromFlows(flowsRef.current, current.globeSettings, false, now)
        setFatSegments(normalGlowLines, normalSegments)
        setFatSegments(normalLines, normalSegments)
        setFatSegments(largeLines, lineSegmentsFromFlows(flowsRef.current, current.globeSettings, true, now))
        setFatSegments(largeTrailLines, largeTrailSegmentsFromFlows(flowsRef.current, current.globeSettings))
        setFatSegments(shimmerLines, shimmerSegmentsFromFlows(flowsRef.current, current.globeSettings, now))
        const showSelected = current.mode === "focus" || (current.mode === "flight" && rawFlight <= 0.08)
        setFatSegments(selectedBaseLines, showSelected ? selectedRouteSegments(current.selected, current.globeSettings, now, true) : new Float32Array())
        setFatSegments(selectedLines, showSelected ? selectedRouteSegments(current.selected, current.globeSettings, now) : new Float32Array())
        lastGeometryUpdate = now
      }

      const normalGlowMaterial = normalGlowLines.material as LineMaterial
      const gridMaterial = gridLines.material as LineMaterial
      const normalMaterial = normalLines.material as LineMaterial
      const shimmerMaterial = shimmerLines.material as LineMaterial
      const largeMaterial = largeLines.material as LineMaterial
      const largeTrailMaterial = largeTrailLines.material as LineMaterial
      const selectedBaseMaterial = selectedBaseLines.material as LineMaterial
      const selectedMaterial = selectedLines.material as LineMaterial
      const normalPulse = 1 + Math.sin(now * 0.0026) * 0.18 * (current.globeSettings.normalPulse ?? 1)
      gridLines.visible = current.globeSettings.showGrid
      gridMaterial.opacity = current.globeSettings.showGrid ? 0.055 * current.globeSettings.surfaceBrightness : 0
      normalGlowMaterial.opacity = 0.1 * normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalGlow ?? 1)
      normalMaterial.opacity = 0.18 * normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalGlow ?? 1)
      shimmerMaterial.opacity = 0.28 * normalPulse * current.globeSettings.arcBrightness * (current.globeSettings.normalHighlight ?? 1)
      largeMaterial.opacity = 0.28 * current.globeSettings.arcBrightness * (current.globeSettings.largeGlow ?? 1)
      largeTrailMaterial.opacity = 0.68 * current.globeSettings.arcBrightness * (current.globeSettings.largeGlow ?? 1)
      normalGlowMaterial.linewidth = 2.1 * (current.globeSettings.normalLineWidth ?? 1) * (current.globeSettings.normalGlow ?? 1)
      normalMaterial.linewidth = 0.9 * (current.globeSettings.normalLineWidth ?? 1)
      shimmerMaterial.linewidth = 1.25 * (current.globeSettings.normalLineWidth ?? 1)
      largeMaterial.linewidth = 1.35
      largeTrailMaterial.linewidth = 2.4 * (current.globeSettings.largeDotScale ?? 1)
      selectedBaseMaterial.linewidth = 1.8
      selectedMaterial.linewidth = 3.0
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
      for (const flow of flowsRef.current) {
        if (!flow.isLarge) continue
        if (flow.phase === "arriving" && sourcePulseIndex < sourcePulses.length) {
          const progress = easeOutCubic(clamp((now - flow.phaseStartedAt) / ARRIVING_MS, 0, 1))
          const pulse = sourcePulses[sourcePulseIndex]
          orientToSurface(pulse, flow.from.vec, 1.018)
          pulse.scale.setScalar((0.08 + progress * 0.22) * (current.globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.86 * (current.globeSettings.largeGlow ?? 1), 0, 1)
          pulse.visible = true
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
          const progress = easeOutCubic(clamp((now - flow.phaseStartedAt) / LANDING_MS, 0, 1))
          const pulse = targetPulses[targetPulseIndex]
          orientToSurface(pulse, flow.to.vec, 1.018)
          pulse.scale.setScalar((0.08 + progress * 0.24) * (current.globeSettings.largeDotScale ?? 1))
          ;(pulse.material as THREE.SpriteMaterial).opacity = clamp((1 - progress) * 0.88 * (current.globeSettings.largeGlow ?? 1), 0, 1)
          pulse.visible = true
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
      shimmerLines.geometry.dispose()
      largeLines.geometry.dispose()
      largeTrailLines.geometry.dispose()
      selectedBaseLines.geometry.dispose()
      selectedLines.geometry.dispose()
      ;(gridLines.material as THREE.Material).dispose()
      ;(normalGlowLines.material as THREE.Material).dispose()
      ;(normalLines.material as THREE.Material).dispose()
      ;(shimmerLines.material as THREE.Material).dispose()
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
      renderer.domElement.remove()
    }
  }, [landPoints, phiRef, thetaRef])

  return (
    <div ref={hostRef} className="globe-canvas three-globe-host" aria-label="Three.js global transaction flow model">
      <canvas ref={flightCanvasRef} className="flight-layer three-flight-layer" />
    </div>
  )
}
