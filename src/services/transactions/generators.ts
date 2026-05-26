import type { FlowPoint, Transaction } from "../../data/transactions"
import { formatEta } from "../../lib/utils"
import { mockHubs, type MockHub } from "./mockHubs"

export const poolNames = ["APAC Prime", "EU Instant", "LATAM Flow", "MENA Express"]
export const rails: Transaction["rail"][] = ["ACH", "WIRE", "SEPA", "PIX", "SWIFT", "FPS"]
export const stableCurrencies = ["USDC", "USDT"] as const
export const stableChains = ["Base", "Ethereum", "Solana", "Polygon", "Tron"] as const

export function wave(t: number, offset: number, speed = 1) {
  return Math.sin(t * speed + offset)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function statusFor(progress: number, seed: number): Transaction["status"] {
  if (progress > 0.94 && seed % 23 === 0) return "failed"
  if (progress < 0.18) return "pending"
  if (progress < 0.82) return "routing"
  return "settled"
}

export function createdStatus(seed: number): Transaction["status"] {
  return pseudoRandom(seed, 53) > 0.72 ? "routing" : "pending"
}

export function transactionId(seed: number, index: number) {
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898 + index * 78.233) * 0xffffff))
  const sequence = seed.toString(36).toUpperCase().padStart(4, "0")
  return `TX-${sequence}-${value.toString(16).toUpperCase().padStart(6, "0").slice(0, 4)}`
}

export function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

export function pseudoRandom(seed: number, salt: number) {
  return Math.abs(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453) % 1
}

export function pickHub(seed: number, salt: number) {
  return mockHubs[Math.floor(pseudoRandom(seed, salt) * mockHubs.length) % mockHubs.length]
}

export function pickCounterparty(seed: number, source: MockHub) {
  let target = pickHub(seed, 7)
  let attempts = 0
  while (target.city === source.city && attempts < 6) {
    target = pickHub(seed + attempts + 1, 11 + attempts)
    attempts += 1
  }
  return target
}

export function withAmount(hub: MockHub, amount: number, currency = hub.currency, chain?: string): FlowPoint {
  return {
    name: hub.name,
    city: hub.city,
    country: hub.country,
    amount,
    currency,
    chain,
    lat: hub.lat,
    lng: hub.lng,
  }
}

export function createTransactionFromHubs(
  seed: number,
  slotIndex: number,
  sourceHub: MockHub,
  targetHub: MockHub,
  statusOverride?: Transaction["status"],
): Transaction {
  const t = seed * 0.73
  const direction: Transaction["direction"] = pseudoRandom(seed, 17) > 0.5 ? "on-ramp" : "off-ramp"
  const stableCurrency = stableCurrencies[Math.floor(pseudoRandom(seed, 23) * stableCurrencies.length) % stableCurrencies.length]
  const stableChain = stableChains[Math.floor(pseudoRandom(seed, 29) * stableChains.length) % stableChains.length]
  const rail = rails[Math.floor(pseudoRandom(seed, 31) * rails.length) % rails.length]
  const progress = Math.abs(Math.sin(seed * 0.173 + slotIndex * 0.41))
  const randomish = Math.abs(Math.sin((seed + 1) * 9.173 + slotIndex * 2.719))
  const scale = 0.16 + Math.pow(randomish, 3.2) * 12 + (slotIndex % 17 === 0 ? 5 : 0)
  const amountDrift =
    1 +
    wave(t, slotIndex * 1.7, 0.42) * 0.026 +
    wave(t, slotIndex * 0.9, 1.1) * 0.014 +
    ((seed + slotIndex) % 5) * 0.003
  const localAmount = sourceHub.baseAmount * amountDrift * scale
  const usdAmount = localAmount * sourceHub.usdRate
  const spread = 0.996 + pseudoRandom(seed, 37) * 0.006
  const fee = Math.max(18, usdAmount * (0.0012 + pseudoRandom(seed, 41) * 0.0024))
  const etaBase = (1 - progress) * (210 + (slotIndex % 60) * 36)
  const sourceAmount = direction === "on-ramp" ? localAmount : usdAmount
  const targetAmount = direction === "on-ramp" ? usdAmount * spread : (usdAmount / targetHub.usdRate) * spread
  const source = direction === "on-ramp"
    ? withAmount(sourceHub, Math.round(sourceAmount * 100) / 100)
    : withAmount(sourceHub, Math.round(sourceAmount * 100) / 100, stableCurrency, stableChain)
  const target = direction === "on-ramp"
    ? withAmount(targetHub, Math.round(targetAmount * 100) / 100, stableCurrency, stableChain)
    : withAmount(targetHub, Math.round(targetAmount * 100) / 100)

  return {
    id: transactionId(seed + hashText(sourceHub.city) + hashText(targetHub.city), slotIndex),
    status: statusOverride ?? statusFor(progress, seed),
    direction,
    source,
    target,
    eta: formatEta(etaBase),
    exchangeRate: Number((targetAmount / sourceAmount).toFixed(6)),
    fee: Number(fee.toFixed(2)),
    rail,
    riskScore: Math.round(clamp(8 + pseudoRandom(seed, 43) * 28 + wave(t, slotIndex * 1.3, 0.55) * 5, 3, 44)),
    liquidityPool: sourceHub.pool === targetHub.pool ? sourceHub.pool : targetHub.pool,
  }
}

export function createTransaction(seed: number, slotIndex: number, statusOverride?: Transaction["status"]): Transaction {
  const sourceHub = pickHub(seed + slotIndex * 3, 3)
  const targetHub = pickCounterparty(seed + slotIndex * 5, sourceHub)
  return createTransactionFromHubs(seed, slotIndex, sourceHub, targetHub, statusOverride)
}

export function initialTransactions(maxTransactions: number, seedOffset: number): Transaction[] {
  return Array.from({ length: maxTransactions }, (_, slotIndex) => {
    const seed = seedOffset + maxTransactions - slotIndex
    return createTransaction(seed, slotIndex)
  })
}

export function trimTransactions(transactions: Transaction[], maxTransactions: number) {
  return transactions.slice(0, clamp(Math.round(maxTransactions), 1, 300))
}

export function appendLiveTransaction(transactions: Transaction[], seed: number, maxTransactions: number) {
  return trimTransactions([createTransaction(seed, 0, createdStatus(seed)), ...transactions], maxTransactions)
}

export function nextStatus(transaction: Transaction, seed: number): Transaction["status"] {
  if (transaction.status === "settled" || transaction.status === "failed") return transaction.status
  const roll = pseudoRandom(seed + hashText(transaction.id), 67)

  if (transaction.status === "pending") {
    if (roll < 0.04) return "failed"
    if (roll < 0.86) return "routing"
    return "pending"
  }

  if (roll < 0.025) return "failed"
  if (roll < 0.68) return "settled"
  return "routing"
}

export function etaForStatus(status: Transaction["status"], seed: number, currentEta: string) {
  if (status === "settled" || status === "failed") return "00:00"
  if (status === "routing") return formatEta(20 + pseudoRandom(seed, 71) * 160)
  return currentEta
}

export function applyLifecycleUpdate(transactions: Transaction[], seed: number) {
  const candidates = transactions
    .map((transaction, index) => ({ transaction, index }))
    .filter(({ transaction }) => transaction.status === "pending" || transaction.status === "routing")

  if (candidates.length === 0) return transactions

  const candidate = candidates[Math.floor(pseudoRandom(seed, 73) * candidates.length) % candidates.length]
  const status = nextStatus(candidate.transaction, seed)
  if (status === candidate.transaction.status) return transactions

  return transactions.map((transaction, index) => {
    if (index !== candidate.index) return transaction

    return {
      ...transaction,
      status,
      eta: etaForStatus(status, seed, transaction.eta),
      riskScore: status === "failed" ? Math.max(transaction.riskScore, 42) : transaction.riskScore,
    }
  })
}

export function nextPools(t: number) {
  return poolNames.map((name, index) => ({
    name,
    utilization: Math.round(clamp(72 + wave(t, index * 1.2, 0.45) * 13 + wave(t, index, 1.4) * 4, 42, 96)),
  }))
}
