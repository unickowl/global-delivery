import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { Transaction } from "../data/transactions"
import type { TransactionEvent, TransactionSource } from "../services/transactions"
import { useLiveDashboard } from "./useLiveDashboard"

function tx(id: string): Transaction {
  const point = (country: string, currency: string, lat: number, lng: number) => ({
    name: "-",
    city: "",
    country,
    amount: 100,
    currency,
    lat,
    lng,
  })

  return {
    id,
    status: "pending",
    direction: "on-ramp",
    source: point("United States", "USD", 40.7128, -74.006),
    target: point("Taiwan", "TWD", 25.033, 121.5654),
    exchangeRate: 31,
    fee: 0,
    rail: "WIRE",
    eta: "00:00",
    riskScore: 0,
    liquidityPool: "OwlPay Pool",
    createdAt: new Date().toISOString(),
  }
}

describe("useLiveDashboard", () => {
  it("caps replace events to maxTransactions", () => {
    let emit: ((event: TransactionEvent) => void) | undefined
    const source: TransactionSource = {
      initial: () => [],
      subscribe: (_options, onEvent) => {
        emit = onEvent
        return () => {}
      },
    }

    const { result } = renderHook(() =>
      useLiveDashboard({ source, maxTransactions: 3 }),
    )

    act(() => {
      emit?.({
        kind: "replace",
        transactions: [tx("1"), tx("2"), tx("3"), tx("4"), tx("5")],
      })
    })

    expect(result.current.transactions.map((item) => item.id)).toEqual(["1", "2", "3"])
  })
})
