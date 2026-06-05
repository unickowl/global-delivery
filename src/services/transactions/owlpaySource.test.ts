import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OwlpayTransactionSource } from "./owlpaySource"
import type { QuoteItem, QuoteListResponse } from "./owlpayTypes"
import type { TransactionEvent } from "./types"

function makeQuote(id: string): QuoteItem {
  return {
    id,
    application: { name: "Acme" },
    sender_country: "US",
    destination_country: "TW",
    source_amount: "100",
    source_currency: "USD",
    destination_amount: "3100",
    destination_currency: "TWD",
    payment_status: "unpaid",
    is_locked: false,
    type: "withdrawal",
    created_at: "2026-06-05T00:00:00.000Z",
    payment_method: "wire",
  }
}

function makeResponse(ids: string[]): QuoteListResponse {
  return { data: ids.map(makeQuote) }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("OwlpayTransactionSource", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("caps first replace and cache to maxTransactions", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse(ids),
    }))

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    unsubscribe()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: "replace" })
    expect(events[0].kind === "replace" ? events[0].transactions : []).toHaveLength(20)
    expect(source.initial({ maxTransactions: 300 })).toHaveLength(20)
  })

  it("does not re-emit unchanged API snapshot items outside the visible buffer as new", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(ids) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(ids) })
    vi.stubGlobal("fetch", fetchMock)

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushMicrotasks()
    unsubscribe()

    expect(events.filter((event) => event.kind === "replace")).toHaveLength(1)
    expect(events.filter((event) => event.kind === "append")).toHaveLength(0)
  })

  it("caps surge replace output when many new quotes arrive", async () => {
    const firstIds = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    const secondIds = Array.from({ length: 100 }, (_, i) => `new-${i}`)
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(firstIds) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(secondIds) }))

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushMicrotasks()
    unsubscribe()

    const replaceEvents = events.filter((event): event is Extract<TransactionEvent, { kind: "replace" }> => event.kind === "replace")
    expect(replaceEvents).toHaveLength(2)
    expect(replaceEvents[1].transactions).toHaveLength(20)
    expect(source.initial({ maxTransactions: 300 })).toHaveLength(20)
  })
})
