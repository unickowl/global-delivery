import type { Transaction } from "../../data/transactions"

// Every metric here is computable from the REAL exposed quote fields only.
// Stablecoin is recovered from the currency symbols (USDC/USDT/...) — NOT a
// separate API field. Chain, real FX, fees, settlement time are NOT exposed by
// the current QuoteHistoryResource, so they are intentionally absent.

const STABLECOINS = new Set(["USDC", "USDT", "USDP", "PYUSD", "DAI", "EURC", "FDUSD", "TUSD", "USDG"])

export function isStablecoin(code: string): boolean {
  return STABLECOINS.has(code.toUpperCase())
}

// The stablecoin leg of an on/off-ramp quote, or null if neither side is one.
export function stablecoinLeg(tx: Transaction): { symbol: string; side: "source" | "target" } | null {
  if (isStablecoin(tx.source.currency)) return { symbol: tx.source.currency.toUpperCase(), side: "source" }
  if (isStablecoin(tx.target.currency)) return { symbol: tx.target.currency.toUpperCase(), side: "target" }
  return null
}

export type Corridor = { key: string; from: string; to: string; count: number; volume: number; pct: number }
export type MixSlice = { name: string; count: number; pct: number }
export type ThroughputBucket = { label: string; onRamp: number; offRamp: number; total: number }

export type MonitorMetrics = {
  total: number
  paid: number
  locked: number
  pending: number
  conversionPct: number
  onRamp: number
  offRamp: number
  quotedVolume: number // over the full data span
  throughputRate: string // adaptive unit, e.g. "2.1/h" or "11/d"
  spanLabel: string // human span, e.g. "18h" / "31d"
  oldestPendingAgeSec: number | null
  corridors: Corridor[]
  railMix: MixSlice[]
  throughput: ThroughputBucket[]
}

const HOUR = 60 * 60 * 1000

function amountOf(tx: Transaction) {
  return Math.max(tx.source.amount, tx.target.amount)
}

function topSlices(counts: Map<string, number>, total: number, limit: number): MixSlice[] {
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count, pct: (count / Math.max(1, total)) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function deriveMonitorMetrics(transactions: Transaction[], now = Date.now()): MonitorMetrics {
  const total = transactions.length
  const paid = transactions.filter((t) => t.status === "settled").length
  const locked = transactions.filter((t) => t.status === "routing").length
  const pending = transactions.filter((t) => t.status === "pending").length
  const onRamp = transactions.filter((t) => t.direction === "on-ramp").length
  const offRamp = transactions.filter((t) => t.direction === "off-ramp").length

  // Adaptive window: span the actual data range instead of a fixed 24h.
  const times = transactions
    .map((t) => (t.createdAt ? new Date(t.createdAt).getTime() : NaN))
    .filter((n) => !Number.isNaN(n))
  const minT = times.length ? Math.min(...times) : now
  const maxT = times.length ? Math.max(...times) : now
  const spanMs = Math.max(1, maxT - minT)
  const spanHours = spanMs / HOUR

  const quotedVolume = transactions.reduce((s, t) => s + amountOf(t), 0)

  const perHour = total / Math.max(spanHours, 1 / 60)
  const throughputRate = spanHours <= 48 ? `${round1(perHour)}/h` : `${round1(perHour * 24)}/d`
  const spanLabel = formatAge(spanMs / 1000)

  const pendingAges = transactions
    .filter((t) => t.status === "pending" && t.createdAt)
    .map((t) => (now - new Date(t.createdAt as string).getTime()) / 1000)
  const oldestPendingAgeSec = pendingAges.length ? Math.max(...pendingAges) : null

  const corridorMap = new Map<string, Corridor>()
  for (const t of transactions) {
    const key = `${t.source.country}→${t.target.country}`
    const c = corridorMap.get(key) ?? { key, from: t.source.country, to: t.target.country, count: 0, volume: 0, pct: 0 }
    c.count += 1
    c.volume += amountOf(t)
    corridorMap.set(key, c)
  }
  const corridors = Array.from(corridorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ ...c, pct: (c.count / Math.max(1, total)) * 100 }))

  const railCounts = new Map<string, number>()
  for (const t of transactions) railCounts.set(t.rail, (railCounts.get(t.rail) ?? 0) + 1)
  const railMix = topSlices(railCounts, total, 6)

  // 12 buckets spread evenly across the actual data span (oldest → newest).
  const buckets = 12
  const bucketMs = spanMs / buckets
  const throughput: ThroughputBucket[] = Array.from({ length: buckets }, (_, i) => ({
    label: `${i + 1}`,
    onRamp: 0,
    offRamp: 0,
    total: 0,
  }))
  for (const t of transactions) {
    if (!t.createdAt) continue
    const offset = new Date(t.createdAt).getTime() - minT
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(offset / bucketMs)))
    if (t.direction === "on-ramp") throughput[idx].onRamp += 1
    else throughput[idx].offRamp += 1
    throughput[idx].total += 1
  }

  return {
    total,
    paid,
    locked,
    pending,
    conversionPct: total ? (paid / total) * 100 : 0,
    onRamp,
    offRamp,
    quotedVolume,
    throughputRate,
    spanLabel,
    oldestPendingAgeSec,
    corridors,
    railMix,
    throughput,
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function formatAge(seconds: number | null): string {
  if (seconds == null) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}
