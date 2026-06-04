import { useEffect, useMemo, useState } from "react"
import type { Transaction } from "../data/transactions"
import type { TransactionSource } from "../services/transactions"

type PoolMetric = { name: string; utilization: number }

export type LiveDashboard = {
  transactions: Transaction[]
  volume24h: number
  volumeChange: number | null
  medianSettlementSeconds: number | null
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
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    source.initial({ maxTransactions }),
  )

  useEffect(() => {
    setTransactions(source.initial({ maxTransactions }))
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
    return unsubscribe
  }, [source, maxTransactions, streamIntervalMs])

  return useMemo(() => {
    const cutoff24h = Date.now() - 24 * 60 * 60 * 1000

    const recent = transactions.filter((tx) =>
      tx.createdAt ? new Date(tx.createdAt).getTime() >= cutoff24h : true,
    )

    const volume24h = recent.reduce(
      (sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount),
      0,
    )

    const routing = transactions.filter((tx) => tx.status === "routing")
    const failed = transactions.filter((tx) => tx.status === "failed")

    const railUptime =
      transactions.length > 0
        ? ((transactions.length - failed.length) / transactions.length) * 100
        : 100

    const utilization =
      transactions.length > 0
        ? Math.round((routing.length / transactions.length) * 100)
        : 0

    return {
      transactions,
      volume24h,
      volumeChange: null,
      medianSettlementSeconds: null,
      pools: [{ name: "OwlPay Pool", utilization }],
      railUptime,
      activeFlows: routing.length,
    }
  }, [transactions])
}
