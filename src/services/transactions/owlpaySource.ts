import type { Transaction } from "../../data/transactions"
import { quoteToTransaction } from "./owlpayAdapter"
import type { QuoteListResponse } from "./owlpayTypes"
import type {
  TransactionEvent,
  TransactionSource,
  TransactionSourceOptions,
  TransactionSourceUnsubscribe,
} from "./types"

const POLL_MS = 10_000

export class OwlpayTransactionSource implements TransactionSource {
  private endpoint: string
  private knownIds = new Set<string>()
  private cache: Transaction[] = []

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  // Returns cached transactions from the last successful poll.
  // Empty on first load; populated by the pre-subscription in App during boot.
  initial({ maxTransactions }: TransactionSourceOptions): Transaction[] {
    return this.cache.slice(0, maxTransactions)
  }

  subscribe(
    _options: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe {
    let cancelled = false
    let firstPollDone = false
    let current: Transaction[] = []

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`${this.endpoint}/api/v1/quotes?per_page=100`, {
          credentials: "include",
        })
        if (cancelled) return
        if (!res.ok) {
          console.warn("[OwlpaySource] API responded", res.status)
          return
        }
        const body: QuoteListResponse = await res.json()
        if (cancelled) return
        const quotes = body.data ?? []
        const next = quotes
          .map(quoteToTransaction)
          .filter((t): t is Transaction => t !== null)

        if (!firstPollDone) {
          // First successful poll — replace everything and warm the cache.
          firstPollDone = true
          this.knownIds = new Set(next.map((t) => t.id))
          current = next
          this.cache = next
          onEvent({ kind: "replace", transactions: next })
          return
        }

        // Diff: new IDs → append, existing with changed status → update
        const nextById = new Map(next.map((t) => [t.id, t]))
        for (const tx of next) {
          if (!this.knownIds.has(tx.id)) {
            this.knownIds.add(tx.id)
            onEvent({ kind: "append", transaction: tx })
          } else {
            const prev = current.find((t) => t.id === tx.id)
            if (prev && prev.status !== tx.status) {
              onEvent({ kind: "update", transaction: tx })
            }
          }
        }
        current = next.concat(
          current.filter((t) => !nextById.has(t.id)),
        )
        this.cache = current
      } catch (err) {
        console.error("[OwlpaySource] poll error:", err)
      }
    }

    poll()
    const timer = window.setInterval(poll, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }
}
