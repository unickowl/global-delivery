import type { Transaction } from "../../data/transactions"

// Frontend-only dynamics for demoing the polling UX when the backend mock is
// static. Each poll evolves an in-memory buffer: it advances the lifecycle of
// existing transactions and injects a few new ones (occasionally a burst large
// enough to trip the source's surge/snapshot path). Geography is cloned from
// the real fetched base, so coordinates and corridors stay valid.

const MAX_BUFFER = 300

// Per-poll probability that an eligible transaction advances one lifecycle step.
const ADVANCE_PROB = 0.22

const STATUS_NEXT: Partial<Record<Transaction["status"], Transaction["status"]>> = {
  pending: "routing",
  routing: "settled",
}

// Mostly a small trickle; ~15% of polls inject a burst that exceeds the
// source's TRICKLE_BATCH_MAX (~6) so snapshot/surge mode is exercised too.
function pickInjectCount(): number {
  const r = Math.random()
  if (r < 0.15) return 8 + Math.floor(Math.random() * 8) // 8–15 → surge
  return 1 + Math.floor(Math.random() * 4) // 1–4 → trickle
}

let seq = 0
function freshId(): string {
  seq += 1
  return `SIM-${Date.now().toString(36)}-${seq}`
}

function makeSynthetic(pool: Transaction[]): Transaction {
  const base = pool[Math.floor(Math.random() * pool.length)]
  const amount = Math.round(500 + Math.random() * 250_000)
  const rate = base.exchangeRate || 1
  return {
    ...base,
    id: freshId(),
    status: "pending",
    source: { ...base.source, amount },
    target: { ...base.target, amount: Math.round(amount * rate) },
    createdAt: new Date().toISOString(),
  }
}

// Advance lifecycle on a fraction of existing transactions, inject new ones,
// and return the next buffer (newest first), trimmed to MAX_BUFFER.
export function evolveSimulation(current: Transaction[]): Transaction[] {
  const advanced = current.map((tx) => {
    const nextStatus = STATUS_NEXT[tx.status]
    if (nextStatus && Math.random() < ADVANCE_PROB) {
      return { ...tx, status: nextStatus }
    }
    return tx
  })

  const injectCount = pickInjectCount()
  const fresh: Transaction[] = []
  for (let i = 0; i < injectCount && advanced.length > 0; i++) {
    fresh.push(makeSynthetic(advanced))
  }

  return [...fresh, ...advanced].slice(0, MAX_BUFFER)
}
