import { describe, expect, it } from "vitest"
import { clamp, easeInOutQuad, easeOutCubic, normalizeVec, slerpInto, toVec3 } from "./vec3"

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("easeInOutQuad", () => {
  it("returns 0 at 0", () => expect(easeInOutQuad(0)).toBe(0))
  it("returns 1 at 1", () => expect(easeInOutQuad(1)).toBe(1))
  it("returns 0.5 at 0.5", () => expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 5))
})

describe("easeOutCubic", () => {
  it("returns 0 at 0", () => expect(easeOutCubic(0)).toBe(0))
  it("returns 1 at 1", () => expect(easeOutCubic(1)).toBe(1))
})

describe("toVec3", () => {
  it("returns a unit-length vector for lat/lng on equator", () => {
    const v = toVec3(0, 0)
    const len = Math.hypot(v[0], v[1], v[2])
    expect(len).toBeCloseTo(1, 5)
  })
})

describe("normalizeVec", () => {
  it("normalizes a non-unit vector to length 1", () => {
    const v: [number, number, number] = [3, 0, 0]
    normalizeVec(v)
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 5)
  })
})

describe("slerpInto", () => {
  it("returns a at t=0", () => {
    const target: [number, number, number] = [0, 0, 0]
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    slerpInto(target, a, b, 0)
    expect(target[0]).toBeCloseTo(1, 5)
    expect(target[1]).toBeCloseTo(0, 5)
  })
  it("returns b at t=1", () => {
    const target: [number, number, number] = [0, 0, 0]
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    slerpInto(target, a, b, 1)
    expect(target[0]).toBeCloseTo(0, 5)
    expect(target[1]).toBeCloseTo(1, 5)
  })
})
