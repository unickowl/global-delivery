import { describe, expect, it, vi } from "vitest"
import { MockTransactionSource } from "./mockSource"

describe("MockTransactionSource", () => {
  it("initial() returns the requested count", () => {
    const source = new MockTransactionSource()
    const txs = source.initial({ maxTransactions: 12 })
    expect(txs).toHaveLength(12)
    expect(txs[0]).toHaveProperty("id")
    expect(txs[0]).toHaveProperty("status")
  })

  it("clamps maxTransactions to [1, 300]", () => {
    const source = new MockTransactionSource()
    expect(source.initial({ maxTransactions: 0 }).length).toBe(1)
    expect(source.initial({ maxTransactions: 9999 }).length).toBe(300)
  })

  it("subscribe() emits append events on interval", () => {
    vi.useFakeTimers()
    const source = new MockTransactionSource()
    const events: string[] = []
    const unsubscribe = source.subscribe(
      { maxTransactions: 10, streamIntervalMs: 100 },
      (event) => events.push(event.kind),
    )
    vi.advanceTimersByTime(350)
    unsubscribe()
    expect(events.filter((k) => k === "append").length).toBeGreaterThanOrEqual(3)
    vi.useRealTimers()
  })

  it("subscribe() emits update events on lifecycle interval", () => {
    vi.useFakeTimers()
    const source = new MockTransactionSource()
    const events: string[] = []
    const unsubscribe = source.subscribe(
      { maxTransactions: 10, streamIntervalMs: 1000 },
      (event) => events.push(event.kind),
    )
    vi.advanceTimersByTime(3000)
    unsubscribe()
    expect(events.filter((k) => k === "update").length).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })
})
