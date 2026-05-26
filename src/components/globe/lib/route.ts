import { type Vec3, slerpInto, normalizeVec } from "./vec3"
import { ARC_SEGMENTS, CAMERA_CORRIDOR_MAX_Y } from "./constants"

type FocusPhase = "idle" | "approach-source" | "source-label" | "flight" | "target-label"

export function constrainCameraCorridor(target: Vec3, maxY = CAMERA_CORRIDOR_MAX_Y) {
  if (Math.abs(target[1]) <= maxY) return target

  const sign = Math.sign(target[1]) || 1
  const y = sign * maxY
  let x = target[0]
  let z = target[2]
  let xz = Math.hypot(x, z)

  if (xz < 0.0001) {
    x = 1
    z = 0
    xz = 1
  }

  const radius = Math.sqrt(Math.max(0.0001, 1 - y * y))
  target[0] = (x / xz) * radius
  target[1] = y
  target[2] = (z / xz) * radius
  return target
}

export function routeSurfacePointInto(target: Vec3, from: Vec3, to: Vec3, t: number) {
  slerpInto(target, from, to, t)
  return normalizeVec(target)
}

export function cameraFocusPointInto(target: Vec3, from: Vec3, to: Vec3, t: number, phase: FocusPhase) {
  if (phase === "approach-source" || phase === "source-label") {
    target[0] = from[0]
    target[1] = from[1]
    target[2] = from[2]
  } else if (phase === "target-label") {
    target[0] = to[0]
    target[1] = to[1]
    target[2] = to[2]
  } else {
    routeSurfacePointInto(target, from, to, t)
  }

  constrainCameraCorridor(target)
  return normalizeVec(target)
}

export function routeSurfacePoint(from: Vec3, to: Vec3, t: number): Vec3 {
  return routeSurfacePointInto([0, 0, 0], from, to, t)
}

export function liftedPointInto(target: Vec3, from: Vec3, to: Vec3, t: number, height: number, midpointScratch: Vec3) {
  routeSurfacePointInto(target, from, to, t)
  midpointScratch[0] = target[0]
  midpointScratch[1] = target[1]
  midpointScratch[2] = target[2]
  normalizeVec(midpointScratch)
  const lift = Math.sin(Math.PI * t)
  target[0] += midpointScratch[0] * height * lift
  target[1] += midpointScratch[1] * height * lift
  target[2] += midpointScratch[2] * height * lift
  return target
}

export function liftedPoint(from: Vec3, to: Vec3, t: number, height: number): Vec3 {
  const point = routeSurfacePoint(from, to, t)
  const lift = Math.sin(Math.PI * t)
  return [
    point[0] + point[0] * height * lift,
    point[1] + point[1] * height * lift,
    point[2] + point[2] * height * lift,
  ]
}

export function createArcPoints(from: Vec3, to: Vec3, height: number, segments = ARC_SEGMENTS) {
  const points: Vec3[] = []
  for (let i = 0; i <= segments; i += 1) {
    points.push(liftedPoint(from, to, i / segments, height))
  }
  return points
}
