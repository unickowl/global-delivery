import * as THREE from "three"
import type { Vec3 } from "./vec3"
import { copyVec3 } from "./vec3"
import { rotationTargetForVec } from "./rotation"

export type ProjectedPoint = { x: number; y: number; z: number }

const projectionScratch = new THREE.Vector3()
const projectionEuler = new THREE.Euler(0, 0, 0, "YXZ")

export function projectedNdcForRotation(vec: Vec3, phi: number, theta: number, scale: number, camera: THREE.Camera, out: ProjectedPoint) {
  const point = copyVec3(projectionScratch, vec, scale)
  projectionEuler.set(-theta, phi, 0, "YXZ")
  point.applyEuler(projectionEuler)
  const depth = point.z
  point.project(camera)
  out.x = point.x
  out.y = point.y
  out.z = depth
  return out
}

export function rotatedDepth(vec: Vec3, phi: number, theta: number) {
  const point = copyVec3(projectionScratch, vec, 1)
  projectionEuler.set(-theta, phi, 0, "YXZ")
  point.applyEuler(projectionEuler)
  return point.z
}

export function frontFacingRotationSeed(vec: Vec3, startPhi: number, startTheta: number) {
  const target = rotationTargetForVec(vec)
  const candidates = [
    { phi: startPhi, theta: startTheta },
    target,
    { ...target, phi: target.phi + Math.PI * 2 },
    { ...target, phi: target.phi - Math.PI * 2 },
  ]

  return candidates
    .filter((candidate) => rotatedDepth(vec, candidate.phi, candidate.theta) > 0.08)
    .sort((a, b) => {
      const da = Math.abs((((a.phi - startPhi) + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) + Math.abs(a.theta - startTheta)
      const db = Math.abs((((b.phi - startPhi) + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI) + Math.abs(b.theta - startTheta)
      return da - db
    })[0] ?? rotationTargetForVec(vec)
}

export function isFrontHemisphere(object: THREE.Object3D, target = new THREE.Vector3()) {
  object.getWorldPosition(target)
  return target.z > -0.04
}
