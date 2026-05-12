import { useEffect, useRef } from "react"
import type { Transaction } from "../data/transactions"

type GlobeMode = "monitor" | "focus" | "flight" | "success"

export type GlobeSettingsState = {
  arcHeight: number
  rotateSpeed: number
  arcBrightness: number
  showGrid: boolean
}

type ArcOverlayProps = {
  transactions: Transaction[]
  selected: Transaction
  mode: GlobeMode
  globeSettings: GlobeSettingsState
  phiRef: React.RefObject<number>
  thetaRef: React.RefObject<number>
}

// --- 3D Math ---

type Vec3 = [number, number, number]

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
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const omega = Math.acos(dot)
  if (Math.abs(omega) < 1e-10) return a
  const sinO = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / sinO
  const wb = Math.sin(t * omega) / sinO
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]
}

function rotatePoint(p: Vec3, phi: number, theta: number): Vec3 {
  const cp = Math.cos(phi),
    sp = Math.sin(phi)
  const x1 = p[0] * cp + p[2] * sp
  const y1 = p[1]
  const z1 = -p[0] * sp + p[2] * cp
  const ct = Math.cos(-theta),
    st = Math.sin(-theta)
  return [x1, y1 * ct - z1 * st, y1 * st + z1 * ct]
}

function project(p: Vec3, cx: number, cy: number, r: number): [number, number] {
  return [cx + p[0] * r, cy - p[1] * r]
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  fromVec: Vec3,
  toVec: Vec3,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  arcHeight: number,
  startT: number,
  endT: number,
  segments = 36,
) {
  const midpoint = slerp(fromVec, toVec, 0.5)
  ctx.beginPath()
  let moved = false
  for (let i = 0; i <= segments; i++) {
    const t = startT + (endT - startT) * (i / segments)
    const point = slerp(fromVec, toVec, t)
    const lift = Math.sin(Math.PI * t)
    const lifted: Vec3 = [
      point[0] + midpoint[0] * arcHeight * lift,
      point[1] + midpoint[1] * arcHeight * lift,
      point[2] + midpoint[2] * arcHeight * lift,
    ]
    const rotated = rotatePoint(lifted, phi, theta)
    if (rotated[2] < -0.05) {
      moved = false
      continue
    }
    const [sx, sy] = project(rotated, cx, cy, radius)
    if (!moved) {
      ctx.moveTo(sx, sy)
      moved = true
    } else {
      ctx.lineTo(sx, sy)
    }
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  vec: Vec3,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
  dotRadius: number,
  color: string,
  glowRadius?: number,
  glowColor?: string,
) {
  const rotated = rotatePoint(vec, phi, theta)
  if (rotated[2] < -0.05) return
  const [sx, sy] = project(rotated, cx, cy, radius)

  if (glowRadius && glowColor) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowRadius)
    g.addColorStop(0, glowColor)
    g.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(sx, sy, dotRadius, 0, Math.PI * 2)
  ctx.fill()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  phi: number,
  theta: number,
) {
  ctx.strokeStyle = "rgba(74, 143, 255, 0.055)"
  ctx.lineWidth = 0.5

  // Latitude lines
  for (let lat = -75; lat <= 75; lat += 15) {
    ctx.beginPath()
    let moved = false
    for (let lng = -180; lng <= 180; lng += 3) {
      const vec = toVec3(lat, lng)
      const rotated = rotatePoint(vec, phi, theta)
      if (rotated[2] < -0.05) {
        moved = false
        continue
      }
      const [sx, sy] = project(rotated, cx, cy, radius)
      if (!moved) {
        ctx.moveTo(sx, sy)
        moved = true
      } else {
        ctx.lineTo(sx, sy)
      }
    }
    ctx.stroke()
  }

  // Longitude lines
  for (let lng = -180; lng < 180; lng += 15) {
    ctx.beginPath()
    let moved = false
    for (let lat = -90; lat <= 90; lat += 3) {
      const vec = toVec3(lat, lng)
      const rotated = rotatePoint(vec, phi, theta)
      if (rotated[2] < -0.05) {
        moved = false
        continue
      }
      const [sx, sy] = project(rotated, cx, cy, radius)
      if (!moved) {
        ctx.moveTo(sx, sy)
        moved = true
      } else {
        ctx.lineTo(sx, sy)
      }
    }
    ctx.stroke()
  }
}

export function ArcOverlay({
  transactions,
  selected,
  mode,
  globeSettings,
  phiRef,
  thetaRef,
}: ArcOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestRef = useRef({ transactions, selected, mode, globeSettings })

  useEffect(() => {
    latestRef.current = { transactions, selected, mode, globeSettings }
  }, [transactions, selected, mode, globeSettings])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

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

      const pixelW = Math.floor(width * dpr)
      const pixelH = Math.floor(height * dpr)
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW
        canvas.height = pixelH
      }

      const ctx = canvas.getContext("2d")
      if (!ctx) {
        raf = requestAnimationFrame(render)
        return
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const { transactions: txs, selected: sel, mode: currentMode, globeSettings: settings } =
        latestRef.current

      const isFlying = currentMode === "flight" || currentMode === "success"
      if (isFlying) {
        raf = requestAnimationFrame(render)
        return
      }

      const phi = phiRef.current ?? 0
      const theta = thetaRef.current ?? 0.22

      const cx = width * 0.5
      const cy = height * 0.5
      const radius = Math.min(width, height) * 0.44

      const now = performance.now()
      const brightness = settings.arcBrightness
      const arcH = settings.arcHeight

      // Draw grid if enabled
      if (settings.showGrid) {
        drawGrid(ctx, cx, cy, radius, phi, theta)
      }

      // Draw arcs
      txs.forEach((tx, index) => {
        const isSelected = tx.id === sel.id
        const isFocusMode = currentMode === "focus"
        const dimmed = isFocusMode && !isSelected

        const fromVec = toVec3(tx.source.lat, tx.source.lng)
        const toVec = toVec3(tx.target.lat, tx.target.lng)

        // Breathing pulse
        const breathCycle = 2400
        const breathPhase = (now % breathCycle) / breathCycle
        const breathAlpha = 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(2 * Math.PI * breathPhase))

        // Arc style
        if (dimmed) {
          ctx.strokeStyle = `rgba(47, 74, 106, ${0.12 * brightness})`
          ctx.lineWidth = 0.5
        } else if (isSelected) {
          ctx.strokeStyle = `rgba(125, 246, 255, ${(0.7 + 0.3 * breathAlpha) * brightness})`
          ctx.lineWidth = 2
          ctx.shadowColor = "rgba(125, 246, 255, 0.3)"
          ctx.shadowBlur = 6
        } else {
          ctx.strokeStyle = `rgba(56, 189, 248, ${0.35 * breathAlpha * brightness})`
          ctx.lineWidth = 1
        }

        drawArc(ctx, fromVec, toVec, cx, cy, radius, phi, theta, arcH, 0, 1, 48)
        ctx.stroke()
        ctx.shadowColor = "transparent"
        ctx.shadowBlur = 0

        // Source dot
        if (!dimmed) {
          drawDot(
            ctx,
            fromVec,
            cx,
            cy,
            radius,
            phi,
            theta,
            isSelected ? 3 : 2,
            isSelected ? "rgba(125, 246, 255, 0.9)" : "rgba(56, 189, 248, 0.6)",
            isSelected ? 10 : 0,
            "rgba(125, 246, 255, 0.15)",
          )
        }

        // Target dot
        if (!dimmed) {
          drawDot(
            ctx,
            toVec,
            cx,
            cy,
            radius,
            phi,
            theta,
            isSelected ? 3 : 2,
            isSelected ? "rgba(74, 222, 128, 0.9)" : "rgba(74, 222, 128, 0.5)",
            isSelected ? 10 : 0,
            "rgba(74, 222, 128, 0.15)",
          )
        }

        // Traveling head marker for selected arc
        if (isSelected && !dimmed) {
          const cycle = 4000
          const headT = ((now + index * 800) % cycle) / cycle
          const headVec = slerp(fromVec, toVec, headT)
          const midpoint = slerp(fromVec, toVec, 0.5)
          const lift = Math.sin(Math.PI * headT)
          const liftedHead: Vec3 = [
            headVec[0] + midpoint[0] * arcH * lift,
            headVec[1] + midpoint[1] * arcH * lift,
            headVec[2] + midpoint[2] * arcH * lift,
          ]

          // Draw bright trail behind the head
          ctx.strokeStyle = `rgba(125, 246, 255, ${0.6 * brightness})`
          ctx.lineWidth = 2.5
          ctx.shadowColor = "rgba(125, 246, 255, 0.5)"
          ctx.shadowBlur = 8
          drawArc(
            ctx,
            fromVec,
            toVec,
            cx,
            cy,
            radius,
            phi,
            theta,
            arcH,
            Math.max(0, headT - 0.15),
            headT,
            16,
          )
          ctx.stroke()
          ctx.shadowColor = "transparent"
          ctx.shadowBlur = 0

          // Draw the head dot
          drawDot(
            ctx,
            liftedHead,
            cx,
            cy,
            radius,
            phi,
            theta,
            4,
            "rgba(255, 255, 255, 0.95)",
            14,
            "rgba(125, 246, 255, 0.4)",
          )
        } else if (!dimmed) {
          // Subtle traveling marker for non-selected arcs
          const cycle = 6000 + index * 800
          const headT = ((now + index * 1200) % cycle) / cycle
          const headVec = slerp(fromVec, toVec, headT)
          const midpoint = slerp(fromVec, toVec, 0.5)
          const lift = Math.sin(Math.PI * headT)
          const liftedHead: Vec3 = [
            headVec[0] + midpoint[0] * arcH * lift,
            headVec[1] + midpoint[1] * arcH * lift,
            headVec[2] + midpoint[2] * arcH * lift,
          ]
          drawDot(
            ctx,
            liftedHead,
            cx,
            cy,
            radius,
            phi,
            theta,
            2,
            `rgba(56, 189, 248, ${0.6 * brightness})`,
          )
        }
      })

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [phiRef, thetaRef])

  return <canvas ref={canvasRef} className="arc-overlay" />
}
