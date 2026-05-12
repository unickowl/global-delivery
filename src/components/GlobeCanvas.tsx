import { type CSSProperties, useEffect, useRef } from "react"
import createGlobe, { type Arc, type Globe, type Marker } from "cobe"
import type { Transaction } from "../data/transactions"
import { FLIGHT_DURATION } from "../App"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

type GlobeCanvasProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  flightStartedAt: number | null
  onFlightDone: () => void
}
const CITY_MARKERS = [
  { id: "city-sf", label: "San Francisco", location: [37.7749, -122.4194] as [number, number] },
  { id: "city-london", label: "London", location: [51.5072, -0.1276] as [number, number] },
  { id: "city-tokyo", label: "Tokyo", location: [35.6762, 139.6503] as [number, number] },
  { id: "city-singapore", label: "Singapore", location: [1.3521, 103.8198] as [number, number] },
  { id: "city-dubai", label: "Dubai", location: [25.2048, 55.2708] as [number, number] },
]

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerpLocation(from: [number, number], to: [number, number], t: number): [number, number] {
  let startLng = from[1]
  let endLng = to[1]
  const delta = endLng - startLng
  if (delta > 180) startLng += 360
  if (delta < -180) endLng += 360
  const lat = from[0] * (1 - t) + to[0] * t
  const lng = startLng * (1 - t) + endLng * t
  return [lat, ((((lng + 180) % 360) + 360) % 360) - 180]
}

function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color)
  g.addColorStop(0.35, color.replace("1)", "0.3)"))
  g.addColorStop(1, color.replace("1)", "0)"))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawFlightScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  progress: number,
  success: number,
  selected: Transaction,
) {
  const cx = w * 0.5
  const cy = h * 0.46
  const speed = now * 0.002

  // Dark red background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
  bg.addColorStop(0, "rgba(255, 40, 30, 0.12)")
  bg.addColorStop(0.4, "rgba(10, 4, 6, 0.95)")
  bg.addColorStop(1, "rgba(6, 2, 3, 1)")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"

  // Converging tunnel rings
  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const phase = ((speed * 0.5 + i / ringCount + progress * 2) % 1)
    const radius = (1 - phase) * Math.max(w, h) * 0.45
    if (radius < 5) continue
    const alpha = phase * 0.4 * (1 - phase)
    ctx.strokeStyle = `rgba(255, 60, 40, ${alpha})`
    ctx.lineWidth = 1 + phase * 3
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Warp streaks (radial lines converging inward)
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2
    const phase = (speed + i * 0.09 + progress * 3) % 1
    const innerR = 20 + phase * 60
    const outerR = innerR + 40 + (1 - phase) * 200
    const alpha = (1 - phase) * 0.3
    ctx.strokeStyle = i % 4 === 0
      ? `rgba(255, 80, 60, ${alpha})`
      : `rgba(255, 180, 160, ${alpha * 0.5})`
    ctx.lineWidth = 1 + (1 - phase) * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR)
    ctx.stroke()
  }

  // Center convergence glow
  const arrival = Math.max(0, (progress - 0.7) / 0.3)
  const glowR = 20 + arrival * 80 + success * 120

  if (success > 0) {
    // Green success burst
    drawGlow(ctx, cx, cy, glowR, `rgba(74, 222, 128, ${0.4 + success * 0.5})`)
  } else {
    // Red convergence
    drawGlow(ctx, cx, cy, glowR, `rgba(255, 60, 40, ${0.2 + arrival * 0.5})`)
  }

  // Center dot
  ctx.fillStyle = success > 0
    ? `rgba(74, 222, 128, ${0.8 + success * 0.2})`
    : `rgba(255, 60, 40, ${0.5 + arrival * 0.5})`
  ctx.beginPath()
  ctx.arc(cx, cy, 4 + arrival * 8 + success * 12, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  // Target city text
  ctx.fillStyle = `rgba(255, 206, 200, ${0.7 + arrival * 0.3})`
  ctx.font = "800 14px 'JetBrains Mono', monospace"
  ctx.textAlign = "center"
  ctx.fillText(selected.target.city.toUpperCase(), cx, cy - 50 - arrival * 20)

  // Progress text
  ctx.fillStyle = "rgba(255, 150, 130, 0.5)"
  ctx.font = "500 11px 'JetBrains Mono', monospace"
  ctx.fillText(`${Math.round(progress * 100)}% ROUTE TRAVERSED`, cx, h - 50)

  // Success text
  if (success > 0) {
    ctx.fillStyle = `rgba(74, 222, 128, ${success})`
    ctx.font = "800 28px 'JetBrains Mono', monospace"
    ctx.fillText("SETTLEMENT CONFIRMED", cx, cy + 80)
    ctx.fillStyle = `rgba(74, 222, 128, ${success * 0.7})`
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

export function GlobeCanvas({ transactions, selected, mode, flightStartedAt, onFlightDone }: GlobeCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const cobeCanvasRef = useRef<HTMLCanvasElement>(null)
  const flightCanvasRef = useRef<HTMLCanvasElement>(null)
  const globeRef = useRef<Globe | null>(null)
  const latestRef = useRef({ transactions, selected, mode, flightStartedAt, onFlightDone })
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 })
  const doneRef = useRef(false)
  const phiRef = useRef(0)
  const dragRef = useRef({
    active: false,
    startX: 0,
    startPhi: 0,
    velocity: 0,
    lastX: 0,
    lastT: 0,
  })

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, flightStartedAt, onFlightDone }
    if (mode === "flight") doneRef.current = false
  }, [flightStartedAt, mode, onFlightDone, selected, transactions])

  useEffect(() => {
    const host = hostRef.current
    const canvas = cobeCanvasRef.current
    if (!host || !canvas) return

    const updateSize = () => {
      const width = Math.max(1, Math.floor(host.clientWidth))
      const height = Math.max(1, Math.floor(host.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { width, height, dpr }
      resizeCanvas(canvas, width, height, dpr)
      globeRef.current?.update({ width: width * dpr, height: height * dpr })
    }

    updateSize()

    const globe = createGlobe(canvas, {
      devicePixelRatio: sizeRef.current.dpr,
      width: sizeRef.current.width * sizeRef.current.dpr,
      height: sizeRef.current.height * sizeRef.current.dpr,
      phi: 0,
      theta: 0.22,
      dark: 1,
      diffuse: 1.08,
      scale: 1,
      opacity: 1,
      mapSamples: 18000,
      mapBrightness: 2.65,
      mapBaseBrightness: 0.01,
      baseColor: [0.08, 0.22, 0.3],
      markerColor: [0.72, 1, 0.96],
      glowColor: [0.08, 0.32, 0.4],
      arcColor: [0.55, 1, 0.9],
      arcWidth: 1.1,
      arcHeight: 0.42,
      markerElevation: 0.04,
      markers: CITY_MARKERS.map((marker) => ({
        id: marker.id,
        location: marker.location,
        size: 0.025,
        color: [0.2, 0.65, 1],
      })),
      arcs: [],
    })
    globeRef.current = globe

    const observer = new ResizeObserver(updateSize)
    observer.observe(host)

    const handlePointerDown = (event: PointerEvent) => {
      if (latestRef.current.mode !== "monitor") return
      dragRef.current = {
        active: true,
        startX: event.clientX,
        startPhi: phiRef.current,
        velocity: 0,
        lastX: event.clientX,
        lastT: performance.now(),
      }
      host.setPointerCapture(event.pointerId)
      host.classList.add("is-dragging")
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag.active) return
      const now = performance.now()
      const width = Math.max(1, host.clientWidth)
      const delta = event.clientX - drag.startX
      const frameDelta = event.clientX - drag.lastX
      const frameTime = Math.max(16, now - drag.lastT)

      phiRef.current = drag.startPhi + (delta / width) * Math.PI * 2
      drag.velocity = (frameDelta / frameTime) * 0.018
      drag.lastX = event.clientX
      drag.lastT = now
    }

    const stopDrag = (event: PointerEvent) => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      host.classList.remove("is-dragging")
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId)
      }
    }

    host.addEventListener("pointerdown", handlePointerDown)
    host.addEventListener("pointermove", handlePointerMove)
    host.addEventListener("pointerup", stopDrag)
    host.addEventListener("pointercancel", stopDrag)

    let raf = 0
    const animate = () => {
      const current = latestRef.current
      const now = performance.now()
      const activeArcs: Arc[] = []
      const activeMarkers: Marker[] = CITY_MARKERS.map((marker) => ({
        id: marker.id,
        location: marker.location,
        size: 0.022,
        color: [0.2, 0.65, 1],
      }))

      current.transactions.forEach((tx, index) => {
        const selectedTx = current.selected.id === tx.id
        const dimmed = current.mode === "focus" && !selectedTx
        const fromLocation: [number, number] = [tx.source.lat, tx.source.lng]
        const toLocation: [number, number] = [tx.target.lat, tx.target.lng]

        // Single clean arc from source to target
        const arcAlpha = dimmed ? 0.15 : selectedTx ? 1 : 0.6
        activeArcs.push({
          id: `arc-${tx.id}`,
          from: fromLocation,
          to: toLocation,
          color: selectedTx
            ? [0.5 * arcAlpha, 1 * arcAlpha, 1 * arcAlpha]
            : [0.3 * arcAlpha, 0.7 * arcAlpha, 0.6 * arcAlpha],
        })

        // Animated head marker traveling along the arc
        const cycle = 6000 + index * 800
        const progress = ((now + index * 1200) % cycle) / cycle
        const headLocation = lerpLocation(fromLocation, toLocation, progress)
        const pulse = 0.85 + Math.sin(now * 0.005 + index) * 0.15

        // Source marker
        activeMarkers.push({
          id: `${tx.id}-source`,
          location: fromLocation,
          size: dimmed ? 0.01 : selectedTx ? 0.03 : 0.02,
          color: [0.5, 0.9, 1],
        })

        // Traveling head
        if (!dimmed) {
          activeMarkers.push({
            id: `${tx.id}-head`,
            location: headLocation,
            size: (selectedTx ? 0.045 : 0.025) * pulse,
            color: selectedTx ? [0.5, 1, 1] : [0.3, 0.8, 0.5],
          })
        }

        // Target marker
        activeMarkers.push({
          id: `${tx.id}-target`,
          location: toLocation,
          size: dimmed ? 0.008 : selectedTx ? 0.025 : 0.015,
          color: [0.4, 1, 0.7],
        })
      })

      const drag = dragRef.current
      if (!drag.active) {
        if (current.mode === "focus") {
          // Smoothly rotate to center the selected transaction's route midpoint
          const midLng = (current.selected.source.lng + current.selected.target.lng) / 2
          const targetPhi = -midLng * (Math.PI / 180) + Math.PI
          let delta = targetPhi - phiRef.current
          // Normalize to [-PI, PI]
          delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
          phiRef.current += delta * 0.04
        } else if (current.mode === "monitor") {
          phiRef.current += 0.0045 + drag.velocity
        } else {
          phiRef.current += 0.0012
        }
        drag.velocity *= 0.94
        if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
      }
      const isFlying = current.mode === "flight" || current.mode === "success"
      globe.update({
        phi: phiRef.current,
        theta: current.mode === "monitor" || current.mode === "focus" ? 0.22 : 0.34,
        scale: current.mode === "focus" ? 1.05 : isFlying ? 1.12 : 1,
        markers: activeMarkers,
        arcs: activeArcs,
        arcWidth: isFlying ? 1.35 : current.mode === "focus" ? 1.4 : 1.22,
        arcHeight: isFlying ? 0.52 : current.mode === "focus" ? 0.42 : 0.34,
      })
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    return () => {
      observer.disconnect()
      host.removeEventListener("pointerdown", handlePointerDown)
      host.removeEventListener("pointermove", handlePointerMove)
      host.removeEventListener("pointerup", stopDrag)
      host.removeEventListener("pointercancel", stopDrag)
      cancelAnimationFrame(raf)
      globeRef.current = null
      globe.destroy()
    }
  }, [])

  useEffect(() => {
    const canvas = flightCanvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return

    let raf = 0
    const render = () => {
      const { mode: currentMode, flightStartedAt: startedAt, selected: currentSelected, onFlightDone: done } = latestRef.current
      const width = Math.max(1, Math.floor(host.clientWidth))
      const height = Math.max(1, Math.floor(host.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      resizeCanvas(canvas, width, height, dpr)

      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const now = performance.now()
      const elapsed = startedAt ? now - startedAt : 0
      const rawFlight = currentMode === "flight" || currentMode === "success" ? Math.min(elapsed / FLIGHT_DURATION, 1) : 0
      const success = currentMode === "success" ? Math.min((elapsed - FLIGHT_DURATION) / 1200, 1) : 0

      if ((currentMode === "flight" || currentMode === "success") && rawFlight > 0.08) {
        drawFlightScene(ctx, width, height, now, easeInOut((rawFlight - 0.08) / 0.92), success, currentSelected)
      }

      if (rawFlight >= 1 && currentMode === "flight" && !doneRef.current) {
        doneRef.current = true
        done()
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={hostRef} className="globe-canvas" aria-label="COBE animated global stablecoin routing globe">
      <canvas ref={cobeCanvasRef} className="cobe-layer" />
      <canvas ref={flightCanvasRef} className="flight-layer" />
      <div className="live-badge">
        <span className="live-dot" />
        <span>LIVE FLOWS</span>
      </div>
      {CITY_MARKERS.map((marker) => (
        <div
          key={marker.id}
          className="cobe-label city-label"
          style={
            {
              positionAnchor: `--cobe-${marker.id}`,
              opacity: `var(--cobe-visible-${marker.id}, 0)`,
            } as CSSProperties
          }
        >
          {marker.label}
        </div>
      ))}
      <div
        className="cobe-label flow-label"
        style={
          {
            positionAnchor: `--cobe-${selected.id}-target`,
            opacity: `var(--cobe-visible-${selected.id}-target, 0)`,
          } as CSSProperties
        }
      >
        {selected.target.city} receiving
      </div>
    </div>
  )
}
