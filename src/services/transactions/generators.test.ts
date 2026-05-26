import { describe, expect, it } from "vitest"
import { clamp, hashText, pseudoRandom, statusFor } from "./generators"

describe("clamp", () => {
  it("returns value when in range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it("returns min when below", () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })
  it("returns max when above", () => {
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("hashText", () => {
  it("is deterministic", () => {
    expect(hashText("hello")).toBe(hashText("hello"))
  })
  it("differs for different inputs", () => {
    expect(hashText("a")).not.toBe(hashText("b"))
  })
})

describe("pseudoRandom", () => {
  it("returns a value in [0, 1)", () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const v = pseudoRandom(seed, 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it("is deterministic", () => {
    expect(pseudoRandom(42, 7)).toBe(pseudoRandom(42, 7))
  })
})

describe("statusFor", () => {
  it("returns 'pending' for low progress", () => {
    expect(statusFor(0.1, 1)).toBe("pending")
  })
  it("returns 'routing' for mid progress", () => {
    expect(statusFor(0.5, 1)).toBe("routing")
  })
  it("returns 'settled' for high progress without failure seed", () => {
    expect(statusFor(0.9, 1)).toBe("settled")
  })
})
