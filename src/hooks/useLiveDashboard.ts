import { useEffect, useMemo, useState } from "react"
import type { Transaction } from "../data/transactions"
import { nextPools, wave } from "../services/transactions/generators"
import type { TransactionSource } from "../services/transactions"

type PoolMetric = { name: string; utilization: number }

export type LiveDashboard = {
  transactions: Transaction[]
  volume24h: number
  volumeChange: number
  medianSettlementSeconds: number
  pools: PoolMetric[]
  railUptime: number
  activeFlows: number
}

export type LiveDashboardOptions = {
  source: TransactionSource
  maxTransactions: number
  streamIntervalMs?: number
}

export function useLiveDashboard({
  source,
  maxTransactions,
  streamIntervalMs = 1400,
}: LiveDashboardOptions): LiveDashboard {
  const [tick, setTick] = useState(() => performance.now())
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    let cancelled = false
    source.initial({ maxTransactions }).then((txs) => {
      if (!cancelled) setTransactions(txs)
    })
    const unsubscribe = source.subscribe(
      { maxTransactions, streamIntervalMs },
      (event) => {
        if (event.kind === "replace") {
          setTransactions(event.transactions)
        } else if (event.kind === "append") {
          setTransactions((current) =>
            [event.transaction, ...current].slice(0, maxTransactions),
          )
        } else if (event.kind === "update") {
          setTransactions((current) =>
            current.map((tx) =>
              tx.id === event.transaction.id ? event.transaction : tx,
            ),
          )
        }
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [source, maxTransactions, streamIntervalMs])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick(performance.now())
    }, 700)
    return () => window.clearInterval(interval)
  }, [])

  return useMemo(() => {
    const t = tick / 1000
    const totalVisible = transactions.reduce(
      (sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount),
      0,
    )
    return {
      transactions,
      volume24h: totalVisible * (34.5 + wave(t, 1.4, 0.08) * 2.2),
      volumeChange: 24 + wave(t, 0.2, 0.32) * 8 + wave(t, 2.8, 0.71) * 2,
      medianSettlementSeconds:
        58 + wave(t, 1.1, 0.36) * 19 + wave(t, 3.2, 0.9) * 6,
      pools: nextPools(t),
      railUptime: 99.84 + wave(t, 0.7, 0.2) * 0.08,
      activeFlows: transactions.filter((tx) => tx.status === "routing").length,
    }
  }, [tick, transactions])
}
