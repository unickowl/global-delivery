import { useEffect, useMemo, useState } from "react"
import { transactions as baseTransactions, type Transaction } from "../data/transactions"
import { formatEta } from "../lib/utils"

type PoolMetric = {
  name: string
  utilization: number
}

export type LiveDashboard = {
  transactions: Transaction[]
  volume24h: number
  volumeChange: number
  medianSettlementSeconds: number
  pools: PoolMetric[]
  railUptime: number
  activeFlows: number
}

const poolNames = ["APAC Prime", "EU Instant", "LATAM Flow", "MENA Express"]
const orderPatterns = [
  [0, 1, 2, 3, 4],
  [4, 0, 2, 1, 3],
  [2, 3, 1, 4, 0],
  [1, 4, 3, 0, 2],
]

function wave(t: number, offset: number, speed = 1) {
  return Math.sin(t * speed + offset)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function statusFor(progress: number): Transaction["status"] {
  if (progress < 0.18) return "pending"
  if (progress < 0.82) return "routing"
  return "settled"
}

function transactionId(seed: number, index: number) {
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898 + index * 78.233) * 0xffffff))
  return `TX-${value.toString(16).toUpperCase().padStart(6, "0").slice(0, 6)}`
}

function nextTransactions(t: number): Transaction[] {
  const tapeCycle = Math.floor(t / 3.4)
  const order = orderPatterns[tapeCycle % orderPatterns.length]

  return order.map((baseIndex, slotIndex) => {
    const transaction = baseTransactions[baseIndex]
    const index = slotIndex
    const cycle = 34 + index * 4
    const progress = ((t + index * 5.2) % cycle) / cycle
    const amountDrift =
      1 +
      wave(t, index * 1.7, 0.42) * 0.026 +
      wave(t, index * 0.9, 1.1) * 0.014 +
      ((tapeCycle + index) % 5) * 0.003
    const sourceAmount = transaction.source.amount * amountDrift
    const targetAmount = sourceAmount * transaction.exchangeRate
    const fee = transaction.fee * (1 + wave(t, index * 2.3, 0.8) * 0.08)
    const etaBase = (1 - progress) * (210 + index * 36)

    return {
      ...transaction,
      id: transactionId(tapeCycle + baseIndex * 13, slotIndex),
      status: statusFor(progress),
      eta: formatEta(etaBase),
      exchangeRate: Number((transaction.exchangeRate * (1 + wave(t, index + 1, 0.24) * 0.0018)).toFixed(6)),
      fee: Number(fee.toFixed(2)),
      riskScore: Math.round(clamp(transaction.riskScore + wave(t, index * 1.3, 0.55) * 5, 3, 44)),
      source: {
        ...transaction.source,
        amount: Math.round(sourceAmount * 100) / 100,
      },
      target: {
        ...transaction.target,
        amount: Math.round(targetAmount * 100) / 100,
      },
    }
  })
}

function nextPools(t: number): PoolMetric[] {
  return poolNames.map((name, index) => ({
    name,
    utilization: Math.round(clamp(72 + wave(t, index * 1.2, 0.45) * 13 + wave(t, index, 1.4) * 4, 42, 96)),
  }))
}

export function useLiveDashboard(): LiveDashboard {
  const [tick, setTick] = useState(() => performance.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick(performance.now())
    }, 700)
    return () => window.clearInterval(interval)
  }, [])

  return useMemo(() => {
    const t = tick / 1000
    const transactions = nextTransactions(t)
    const totalVisible = transactions.reduce((sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount), 0)

    return {
      transactions,
      volume24h: totalVisible * (34.5 + wave(t, 1.4, 0.08) * 2.2),
      volumeChange: 24 + wave(t, 0.2, 0.32) * 8 + wave(t, 2.8, 0.71) * 2,
      medianSettlementSeconds: 58 + wave(t, 1.1, 0.36) * 19 + wave(t, 3.2, 0.9) * 6,
      pools: nextPools(t),
      railUptime: 99.84 + wave(t, 0.7, 0.2) * 0.08,
      activeFlows: transactions.filter((tx) => tx.status === "routing").length,
    }
  }, [tick])
}
