import * as THREE from "three"

export type Vec3 = [number, number, number]

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

export function toVec3(lat: number, lng: number): Vec3 {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  return [
    -Math.cos(latRad) * Math.cos(lngRad),
    Math.sin(latRad),
    Math.cos(latRad) * Math.sin(lngRad),
  ]
}

export function setVec3FromLatLng(target: Vec3, lat: number, lng: number) {
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  target[0] = -Math.cos(latRad) * Math.cos(lngRad)
  target[1] = Math.sin(latRad)
  target[2] = Math.cos(latRad) * Math.sin(lngRad)
  return target
}

export function toVector3(vec: Vec3, scale = 1) {
  return new THREE.Vector3(vec[0] * scale, vec[1] * scale, vec[2] * scale)
}

export function copyVec3(target: THREE.Vector3, vec: Vec3, scale = 1) {
  target.set(vec[0] * scale, vec[1] * scale, vec[2] * scale)
  return target
}

export function slerpInto(target: Vec3, a: Vec3, b: Vec3, t: number) {
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)
  const omega = Math.acos(dot)
  if (Math.abs(omega) < 1e-8) {
    target[0] = a[0]
    target[1] = a[1]
    target[2] = a[2]
    return target
  }
  const sinO = Math.sin(omega)
  const wa = Math.sin((1 - t) * omega) / sinO
  const wb = Math.sin(t * omega) / sinO
  target[0] = a[0] * wa + b[0] * wb
  target[1] = a[1] * wa + b[1] * wb
  target[2] = a[2] * wa + b[2] * wb
  return target
}

export function normalizeVec(target: Vec3) {
  const len = Math.hypot(target[0], target[1], target[2]) || 1
  target[0] /= len
  target[1] /= len
  target[2] /= len
  return target
}
