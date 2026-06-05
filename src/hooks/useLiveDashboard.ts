import { useEffect, useState } from "react"
import type { Transaction } from "../data/transactions"
import type { TransactionSource } from "../services/transactions"

export type LiveDashboard = { transactions: Transaction[] }

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
          setTransactions(event.transactions.slice(0, maxTransactions))
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

  return { transactions }
}
