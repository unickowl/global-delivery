import { type CSSProperties, useEffect, useMemo, useRef } from "react"
import createGlobe, { type Arc, type Globe, type Marker } from "cobe"
import type { Transaction } from "../data/transactions"

type GlobeMode = "monitor" | "flight" | "success"

type GlobeCanvasProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  flightStartedAt: number | null
  onFlightDone: () => void
}

const FLIGHT_DURATION = 6400
const CITY_MARKERS = [
  { id: "city-sf", label: "San Francisco", location: [37.7749, -122.4194] as [number, number] },
  { id: "city-london", label: "London", location: [51.5072, -0.1276] as [number, number] },
  { id: "city-tokyo", label: "Tokyo", location: [35.6762, 139.6503] as [number, number] },
  { id: "city-singapore", label: "Singapore", location: [1.3521, 103.8198] as [number, number] },
  { id: "city-dubai", label: "Dubai", location: [25.2048, 55.2708] as [number, number] },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function amountWeight(tx: Transaction, minLog: number, maxLog: number) {
  const nominal = Math.max(tx.source.amount, tx.target.amount)
  return clamp((Math.log10(nominal) - minLog) / Math.max(1, maxLog - minLog), 0, 1)
}

function mixLocation(from: [number, number], to: [number, number], progress: number): [number, number] {
  let startLng = from[1]
  let endLng = to[1]
  const delta = endLng - startLng
  if (delta > 180) startLng += 360
  if (delta < -180) endLng += 360

  const lift = Math.sin(Math.PI * progress) * 10
  const lat = from[0] * (1 - progress) + to[0] * progress + lift
  const lng = startLng * (1 - progress) + endLng * progress
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
  const cy = h * (0.46 - progress * 0.08)
  const speed = now * 0.0018
  const arrival = Math.max(0, (progress - 0.74) / 0.26)

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.76)
  bg.addColorStop(0, "rgba(24, 210, 226, 0.22)")
  bg.addColorStop(0.42, "rgba(3, 19, 28, 0.96)")
  bg.addColorStop(1, "rgba(2, 5, 8, 1)")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"
  for (let i = 0; i < 42; i += 1) {
    const lane = (i / 42) * Math.PI * 2
    const phase = (speed + i * 0.071 + progress * 3.6) % 1
    const near = 0.08 + phase * 1.18
    const far = near + 0.12
    const curve = Math.sin(progress * Math.PI + i) * 80
    const x1 = cx + Math.cos(lane) * near * w * 0.46 + curve * near
    const y1 = cy + Math.sin(lane) * near * h * 0.35 + progress * h * 0.08
    const x2 = cx + Math.cos(lane) * far * w * 0.52 + curve * far
    const y2 = cy + Math.sin(lane) * far * h * 0.42 + progress * h * 0.1
    const alpha = Math.max(0, 1 - near) * 0.65

    ctx.strokeStyle = i % 3 === 0 ? `rgba(74, 222, 128, ${alpha})` : `rgba(125, 246, 255, ${alpha})`
    ctx.lineWidth = 1 + near * 5
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  const routeGradient = ctx.createLinearGradient(cx, h, cx, cy)
  routeGradient.addColorStop(0, "rgba(74, 222, 128, 0)")
  routeGradient.addColorStop(0.42, "rgba(125, 246, 255, 0.72)")
  routeGradient.addColorStop(1, "rgba(255, 255, 255, 0.95)")
  ctx.strokeStyle = routeGradient
  ctx.lineWidth = 5
  ctx.shadowBlur = 28
  ctx.shadowColor = "rgba(125, 246, 255, 0.78)"
  ctx.beginPath()
  ctx.moveTo(cx - w * 0.2, h + 80)
  ctx.bezierCurveTo(cx - w * 0.05, h * 0.72, cx + w * 0.16, h * 0.58, cx, cy)
  ctx.stroke()
  ctx.shadowBlur = 0

  drawGlow(ctx, cx, cy, 30 + arrival * 160 + success * 120, `rgba(74, 222, 128, ${0.3 + arrival * 0.55})`)
  ctx.strokeStyle = `rgba(74, 222, 128, ${0.35 + arrival * 0.5})`
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(cx, cy, 30 + arrival * 65, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  ctx.fillStyle = "rgba(230, 255, 255, 0.92)"
  ctx.font = "700 13px Inter, system-ui"
  ctx.textAlign = "center"
  ctx.fillText(selected.target.city.toUpperCase(), cx, cy - 48 - arrival * 26)
  ctx.fillStyle = "rgba(125, 246, 255, 0.68)"
  ctx.font = "500 12px Inter, system-ui"
  ctx.fillText(`${Math.round(progress * 100)}% ROUTE TRAVERSED`, cx, h - 38)

  if (success > 0) {
    ctx.fillStyle = `rgba(74, 222, 128, ${success})`
    ctx.font = "800 30px Inter, system-ui"
    ctx.fillText("SETTLEMENT CONFIRMED", cx, cy + 112)
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

  const amountRange = useMemo(() => {
    const logs = transactions.map((tx) => Math.log10(Math.max(tx.source.amount, tx.target.amount)))
    return {
      min: Math.min(...logs),
      max: Math.max(...logs),
    }
  }, [transactions])

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
        const cycle = 8600 + index * 640
        const duration = 4400 + index * 240
        const local = ((now + index * 1330) % cycle) / duration
        const visible = local <= 1
        const selectedTx = current.selected.id === tx.id
        if (!visible && !selectedTx) return

        const weight = amountWeight(tx, amountRange.min, amountRange.max)
        const progress = clamp(local, 0, 1)
        const fadeIn = clamp(progress / 0.16, 0, 1)
        const fadeOut = clamp((1 - progress) / 0.22, 0, 1)
        const alpha = selectedTx ? 1 : fadeIn * fadeOut
        const segmentCount = Math.round(3 + weight * 3 + (selectedTx ? 1 : 0))
        const tailLength = 0.18 + weight * 0.2
        const fromLocation: [number, number] = [tx.source.lat, tx.source.lng]
        const toLocation: [number, number] = [tx.target.lat, tx.target.lng]

        for (let segment = 0; segment < segmentCount; segment += 1) {
          const segmentHead = clamp(progress - segment * (tailLength / segmentCount), 0, 1)
          const segmentTail = clamp(segmentHead - tailLength / segmentCount, 0, 1)
          if (segmentHead <= 0 || segmentHead <= segmentTail) continue

          const segmentAlpha = alpha * (1 - segment / segmentCount)
          const segmentColor: [number, number, number] = selectedTx
            ? [0.7 + segmentAlpha * 0.3, 1, 1]
            : [0.32 + weight * 0.42 + segmentAlpha * 0.25, 0.72 + segmentAlpha * 0.28, 0.56 + weight * 0.24]

          activeArcs.push({
            id: `arc-${tx.id}-${segment}`,
            from: mixLocation(fromLocation, toLocation, segmentTail),
            to: mixLocation(fromLocation, toLocation, segmentHead),
            color: segmentColor,
          })
        }

        if (visible || selectedTx) {
          const pulse = (0.85 + Math.sin(now * 0.006 + index) * 0.15) * Math.max(0.35, alpha)
          const headLocation = mixLocation(fromLocation, toLocation, progress)
          activeMarkers.push(
            {
              id: `${tx.id}-source`,
              location: [tx.source.lat, tx.source.lng],
              size: (0.014 + weight * 0.018) * Math.max(0.35, alpha),
              color: [0.95, 1, 1],
            },
            {
              id: `${tx.id}-head`,
              location: headLocation,
              size: (0.04 + weight * 0.07) * pulse,
              color: selectedTx ? [0.95, 1, 1] : [0.55, 1, 0.74],
            },
          )

          if (progress > 0.78) {
            activeMarkers.push({
              id: `${tx.id}-target`,
              location: [tx.target.lat, tx.target.lng],
              size: (0.02 + weight * 0.04) * clamp((progress - 0.78) / 0.22, 0, 1),
              color: [0.72, 1, 0.68],
            })
          }
        }
      })

      const drag = dragRef.current
      if (!drag.active) {
        phiRef.current += current.mode === "monitor" ? 0.0045 + drag.velocity : 0.0012
        drag.velocity *= 0.94
        if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
      }
      globe.update({
        phi: phiRef.current,
        theta: current.mode === "monitor" ? 0.22 : 0.34,
        scale: current.mode === "monitor" ? 1 : 1.12,
        markers: activeMarkers,
        arcs: activeArcs,
        arcWidth: current.mode === "monitor" ? 1.22 : 1.35,
        arcHeight: current.mode === "monitor" ? 0.34 : 0.52,
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
  }, [amountRange.max, amountRange.min])

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

      if (currentMode !== "monitor" && rawFlight > 0.08) {
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
