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
  private firstPollDone = false
  private knownIds = new Set<string>()
  private current: Transaction[] = []

  constructor(endpoint: string) {
    this.endpoint = endpoint
  }

  // Returns empty synchronously; real data arrives via the first replace event.
  initial(_options: TransactionSourceOptions): Transaction[] {
    return []
  }

  subscribe(
    _options: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe {
    let cancelled = false

    const poll = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`${this.endpoint}/api/v1/quotes?per_page=100`, {
          credentials: "include",
        })
        if (!res.ok) {
          console.warn("[OwlpaySource] API responded", res.status)
          return
        }
        const body: QuoteListResponse = await res.json()
        const quotes = body.data ?? []
        const next = quotes
          .map(quoteToTransaction)
          .filter((t): t is Transaction => t !== null)

        if (!this.firstPollDone) {
          // First successful poll — replace everything
          this.firstPollDone = true
          this.knownIds = new Set(next.map((t) => t.id))
          this.current = next
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
            const prev = this.current.find((t) => t.id === tx.id)
            if (prev && prev.status !== tx.status) {
              onEvent({ kind: "update", transaction: tx })
            }
          }
        }
        this.current = next.concat(
          this.current.filter((t) => !nextById.has(t.id)),
        )
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
