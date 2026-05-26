import type { Transaction } from "../../data/transactions"
import {
  applyLifecycleUpdate,
  appendLiveTransaction,
  initialTransactions,
} from "./generators"
import type {
  TransactionEvent,
  TransactionSource,
  TransactionSourceOptions,
  TransactionSourceUnsubscribe,
} from "./types"

function clampMax(value: number) {
  return Math.min(300, Math.max(1, Math.round(value)))
}

export class MockTransactionSource implements TransactionSource {
  private seed = Math.floor(Math.random() * 1_000_000)
  private sequence = this.seed

  initial({ maxTransactions }: TransactionSourceOptions): Transaction[] {
    const max = clampMax(maxTransactions)
    this.sequence = this.seed + max
    return initialTransactions(max, this.seed)
  }

  subscribe(
    { maxTransactions, streamIntervalMs = 1400 }: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe {
    const max = clampMax(maxTransactions)
    let current = initialTransactions(max, this.seed)

    const appendTimer = window.setInterval(() => {
      this.sequence += 1
      current = appendLiveTransaction(current, this.sequence, max)
      onEvent({ kind: "append", transaction: current[0] })
    }, streamIntervalMs)

    const lifecycleTimer = window.setInterval(() => {
      this.sequence += 1
      const next = applyLifecycleUpdate(current, this.sequence)
      if (next !== current) {
        const changed = next.find((tx, i) => tx !== current[i])
        current = next
        if (changed) onEvent({ kind: "update", transaction: changed })
      }
    }, Math.max(900, Math.round(streamIntervalMs * 0.85)))

    return () => {
      window.clearInterval(appendTimer)
      window.clearInterval(lifecycleTimer)
    }
  }
}
