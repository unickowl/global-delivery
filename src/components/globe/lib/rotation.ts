import type { MutableRefObject } from "react"
import * as THREE from "three"
import type { Vec3 } from "./vec3"
import { clamp } from "./vec3"
import { MAX_VIEW_THETA } from "./constants"
import { frontFacingRotationSeed, projectedNdcForRotation } from "./projection"

export function rotationTargetForLatLng(lat: number, lng: number) {
  return {
    phi: Math.PI / 2 - lng * (Math.PI / 180),
    theta: clamp(lat * (Math.PI / 180), -MAX_VIEW_THETA, MAX_VIEW_THETA),
  }
}

export function easeRotationToward(phiRef: MutableRefObject<number>, thetaRef: MutableRefObject<number>, targetPhi: number, targetTheta: number, strength: number) {
  let delta = targetPhi - phiRef.current
  delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  phiRef.current += delta * strength
  thetaRef.current += (targetTheta - thetaRef.current) * strength
}

export function rotationTargetForVec(vec: Vec3) {
  const lat = Math.asin(clamp(vec[1], -1, 1)) * (180 / Math.PI)
  const lng = Math.atan2(vec[2], -vec[0]) * (180 / Math.PI)
  return rotationTargetForLatLng(lat, lng)
}

export function solveRotationForScreenPoint(
  vec: Vec3,
  startPhi: number,
  startTheta: number,
  camera: THREE.Camera,
  scale: number,
  targetX = 0,
  targetY = 0.18,
) {
  const seed = frontFacingRotationSeed(vec, startPhi, startTheta)
  let phi = seed.phi
  let theta = seed.theta
  const epsilon = 0.002
  const current = { x: 0, y: 0, z: 0 }
  const phiSample = { x: 0, y: 0, z: 0 }
  const thetaSample = { x: 0, y: 0, z: 0 }
  const depthCheck = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < 10; i += 1) {
    projectedNdcForRotation(vec, phi, theta, scale, camera, current)
    const errorX = targetX - current.x
    const errorY = targetY - current.y
    if (Math.abs(errorX) + Math.abs(errorY) < 0.003) break

    projectedNdcForRotation(vec, phi + epsilon, theta, scale, camera, phiSample)
    projectedNdcForRotation(vec, phi, theta + epsilon, scale, camera, thetaSample)
    const a = (phiSample.x - current.x) / epsilon
    const b = (thetaSample.x - current.x) / epsilon
    const c = (phiSample.y - current.y) / epsilon
    const d = (thetaSample.y - current.y) / epsilon
    const determinant = a * d - b * c
    if (Math.abs(determinant) < 0.0001) break

    phi += clamp((errorX * d - b * errorY) / determinant, -0.18, 0.18)
    theta = clamp(theta + clamp((a * errorY - errorX * c) / determinant, -0.18, 0.18), -MAX_VIEW_THETA, MAX_VIEW_THETA)
    if (projectedNdcForRotation(vec, phi, theta, scale, camera, depthCheck).z < 0.08) {
      const fallback = rotationTargetForVec(vec)
      phi = fallback.phi
      theta = fallback.theta
      break
    }
  }

  return { phi, theta }
}
