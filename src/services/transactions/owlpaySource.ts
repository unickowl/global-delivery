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
// Release one new transaction every TRICKLE_MS so the queue looks like a live stream.
const TRICKLE_MS = 1_500
// Max new transactions that can fully drain before the next poll.
// If a poll delivers more than this, switch to snapshot mode instead of trickle.
const TRICKLE_BATCH_MAX = Math.floor(POLL_MS / TRICKLE_MS) // ~6

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

    // Trickle queue: new transactions are enqueued here and released one
    // per TRICKLE_MS so the queue panel looks like a live stream rather than
    // a batch dump every 10 seconds.
    const trickleQueue: Transaction[] = []
    const trickleTimer = window.setInterval(() => {
      if (cancelled) return
      const tx = trickleQueue.shift()
      if (tx) onEvent({ kind: "append", transaction: tx })
    }, TRICKLE_MS)

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
          // First successful poll — replace everything at once and warm the cache.
          // No trickle here: initial load should populate the globe immediately.
          firstPollDone = true
          this.knownIds = new Set(next.map((t) => t.id))
          current = next
          this.cache = next
          onEvent({ kind: "replace", transactions: next })
          return
        }

        // Pre-scan: how many new IDs are in this poll?
        const newTxs = next.filter((t) => !this.knownIds.has(t.id))
        const hasBacklog = trickleQueue.length > 0

        // Surge mode: too many new transactions to drain before the next poll,
        // or the previous trickle queue hasn't cleared yet.
        // → Discard pending trickle, emit a full snapshot instead.
        const surgeMode = hasBacklog || newTxs.length > TRICKLE_BATCH_MAX

        const nextById = new Map(next.map((t) => [t.id, t]))

        if (surgeMode) {
          // Register all new IDs so they aren't re-announced next poll.
          for (const tx of newTxs) this.knownIds.add(tx.id)
          trickleQueue.length = 0
          current = next.concat(current.filter((t) => !nextById.has(t.id)))
          this.cache = current
          onEvent({ kind: "replace", transactions: current })
        } else {
          // Normal trickle mode: status changes fire immediately, new IDs queue up.
          for (const tx of next) {
            if (!this.knownIds.has(tx.id)) {
              this.knownIds.add(tx.id)
              trickleQueue.push(tx)
            } else {
              const prev = current.find((t) => t.id === tx.id)
              if (prev && prev.status !== tx.status) {
                onEvent({ kind: "update", transaction: tx })
              }
            }
          }
          current = next.concat(current.filter((t) => !nextById.has(t.id)))
          this.cache = current
        }
      } catch (err) {
        console.error("[OwlpaySource] poll error:", err)
      }
    }

    poll()
    const timer = window.setInterval(poll, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.clearInterval(trickleTimer)
    }
  }
}
