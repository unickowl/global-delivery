import { describe, expect, it } from "vitest"
import { constrainCameraCorridor, routeSurfacePoint } from "./route"
import { CAMERA_CORRIDOR_MAX_Y } from "./constants"

describe("constrainCameraCorridor", () => {
  it("does not alter a vector inside the corridor", () => {
    const v: [number, number, number] = [1, 0, 0]
    constrainCameraCorridor(v)
    expect(v[1]).toBe(0)
  })
  it("clamps y above the corridor max", () => {
    const v: [number, number, number] = [0, 1, 0]
    constrainCameraCorridor(v)
    expect(Math.abs(v[1])).toBeLessThanOrEqual(CAMERA_CORRIDOR_MAX_Y + 0.001)
  })
})

describe("routeSurfacePoint", () => {
  it("returns a unit-length vector for any t in [0,1]", () => {
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = routeSurfacePoint(a, b, t)
      expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1, 5)
    }
  })
})
