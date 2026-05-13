import { useEffect, useMemo, useRef, useState } from "react"
import type { FlowPoint, Transaction } from "../data/transactions"
import { formatEta } from "../lib/utils"

type PoolMetric = {
  name: string
  utilization: number
}

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
  maxTransactions: number
  streamIntervalMs?: number
}

const poolNames = ["APAC Prime", "EU Instant", "LATAM Flow", "MENA Express"]
const rails: Transaction["rail"][] = ["ACH", "WIRE", "SEPA", "PIX", "SWIFT", "FPS"]
const stableCurrencies = ["USDC", "USDT"] as const
const stableChains = ["Base", "Ethereum", "Solana", "Polygon", "Tron"] as const

type MockHub = Omit<FlowPoint, "amount"> & {
  baseAmount: number
  usdRate: number
  pool: string
}

const mockHubs: MockHub[] = [
  { name: "Meridian Treasury", city: "San Francisco", country: "United States", currency: "USD", lat: 37.7749, lng: -122.4194, baseAmount: 420000, usdRate: 1, pool: "APAC Prime" },
  { name: "Hudson Settlement", city: "New York", country: "United States", currency: "USD", lat: 40.7128, lng: -74.006, baseAmount: 610000, usdRate: 1, pool: "EU Instant" },
  { name: "Maple Clearing", city: "Toronto", country: "Canada", currency: "CAD", lat: 43.6532, lng: -79.3832, baseAmount: 520000, usdRate: 0.73, pool: "EU Instant" },
  { name: "Atlas Exchange", city: "Singapore", country: "Singapore", currency: "SGD", lat: 1.3521, lng: 103.8198, baseAmount: 560000, usdRate: 0.74, pool: "APAC Prime" },
  { name: "Sakura Capital", city: "Tokyo", country: "Japan", currency: "JPY", lat: 35.6762, lng: 139.6503, baseAmount: 84000000, usdRate: 0.0064, pool: "APAC Prime" },
  { name: "Harbor Market", city: "Sydney", country: "Australia", currency: "AUD", lat: -33.8688, lng: 151.2093, baseAmount: 730000, usdRate: 0.66, pool: "APAC Prime" },
  { name: "Pearl Holdings", city: "Hong Kong", country: "Hong Kong", currency: "HKD", lat: 22.3193, lng: 114.1694, baseAmount: 3100000, usdRate: 0.128, pool: "APAC Prime" },
  { name: "Han River Desk", city: "Seoul", country: "South Korea", currency: "KRW", lat: 37.5665, lng: 126.978, baseAmount: 690000000, usdRate: 0.00073, pool: "APAC Prime" },
  { name: "Bandra Liquidity", city: "Mumbai", country: "India", currency: "INR", lat: 19.076, lng: 72.8777, baseAmount: 43000000, usdRate: 0.012, pool: "MENA Express" },
  { name: "Chao Phraya FX", city: "Bangkok", country: "Thailand", currency: "THB", lat: 13.7563, lng: 100.5018, baseAmount: 15200000, usdRate: 0.027, pool: "APAC Prime" },
  { name: "Java Remit", city: "Jakarta", country: "Indonesia", currency: "IDR", lat: -6.2088, lng: 106.8456, baseAmount: 6900000000, usdRate: 0.000061, pool: "APAC Prime" },
  { name: "Nova Remit", city: "London", country: "United Kingdom", currency: "GBP", lat: 51.5072, lng: -0.1276, baseAmount: 185000, usdRate: 1.25, pool: "EU Instant" },
  { name: "Main River Bank", city: "Frankfurt", country: "Germany", currency: "EUR", lat: 50.1109, lng: 8.6821, baseAmount: 260000, usdRate: 1.09, pool: "EU Instant" },
  { name: "Iberia Logistics", city: "Madrid", country: "Spain", currency: "EUR", lat: 40.4168, lng: -3.7038, baseAmount: 170000, usdRate: 1.09, pool: "EU Instant" },
  { name: "Nordic Rail", city: "Stockholm", country: "Sweden", currency: "SEK", lat: 59.3293, lng: 18.0686, baseAmount: 3100000, usdRate: 0.095, pool: "EU Instant" },
  { name: "Alpine Vault", city: "Zurich", country: "Switzerland", currency: "CHF", lat: 47.3769, lng: 8.5417, baseAmount: 380000, usdRate: 1.11, pool: "EU Instant" },
  { name: "Rio Desk", city: "Sao Paulo", country: "Brazil", currency: "BRL", lat: -23.5558, lng: -46.6396, baseAmount: 510000, usdRate: 0.19, pool: "LATAM Flow" },
  { name: "Norte Foods", city: "Mexico City", country: "Mexico", currency: "MXN", lat: 19.4326, lng: -99.1332, baseAmount: 1617050, usdRate: 0.059, pool: "LATAM Flow" },
  { name: "Andes Pay", city: "Santiago", country: "Chile", currency: "CLP", lat: -33.4489, lng: -70.6693, baseAmount: 420000000, usdRate: 0.0011, pool: "LATAM Flow" },
  { name: "Plata Clearing", city: "Buenos Aires", country: "Argentina", currency: "ARS", lat: -34.6037, lng: -58.3816, baseAmount: 390000000, usdRate: 0.001, pool: "LATAM Flow" },
  { name: "Lima Merchant", city: "Lima", country: "Peru", currency: "PEN", lat: -12.0464, lng: -77.0428, baseAmount: 1330000, usdRate: 0.27, pool: "LATAM Flow" },
  { name: "Delta Vault", city: "Dubai", country: "United Arab Emirates", currency: "AED", lat: 25.2048, lng: 55.2708, baseAmount: 1450000, usdRate: 0.272, pool: "MENA Express" },
  { name: "Riyadh Settlement", city: "Riyadh", country: "Saudi Arabia", currency: "SAR", lat: 24.7136, lng: 46.6753, baseAmount: 2100000, usdRate: 0.267, pool: "MENA Express" },
  { name: "Bosphorus Trade", city: "Istanbul", country: "Turkey", currency: "TRY", lat: 41.0082, lng: 28.9784, baseAmount: 18500000, usdRate: 0.031, pool: "MENA Express" },
  { name: "Nile Exchange", city: "Cairo", country: "Egypt", currency: "EGP", lat: 30.0444, lng: 31.2357, baseAmount: 22600000, usdRate: 0.021, pool: "MENA Express" },
  { name: "Lagos Commerce", city: "Lagos", country: "Nigeria", currency: "NGN", lat: 6.5244, lng: 3.3792, baseAmount: 720000000, usdRate: 0.00062, pool: "MENA Express" },
  { name: "Nairobi Mobile", city: "Nairobi", country: "Kenya", currency: "KES", lat: -1.2921, lng: 36.8219, baseAmount: 64000000, usdRate: 0.0077, pool: "MENA Express" },
  { name: "Cape Treasury", city: "Cape Town", country: "South Africa", currency: "ZAR", lat: -33.9249, lng: 18.4241, baseAmount: 8200000, usdRate: 0.055, pool: "MENA Express" },
  { name: "Manila Corridor", city: "Manila", country: "Philippines", currency: "PHP", lat: 14.5995, lng: 120.9842, baseAmount: 26000000, usdRate: 0.017, pool: "APAC Prime" },
  { name: "Auckland Bridge", city: "Auckland", country: "New Zealand", currency: "NZD", lat: -36.8509, lng: 174.7645, baseAmount: 540000, usdRate: 0.61, pool: "APAC Prime" },
]

function wave(t: number, offset: number, speed = 1) {
  return Math.sin(t * speed + offset)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function statusFor(progress: number, seed: number): Transaction["status"] {
  if (progress > 0.94 && seed % 23 === 0) return "failed"
  if (progress < 0.18) return "pending"
  if (progress < 0.82) return "routing"
  return "settled"
}

function createdStatus(seed: number): Transaction["status"] {
  return pseudoRandom(seed, 53) > 0.72 ? "routing" : "pending"
}

function transactionId(seed: number, index: number) {
  const value = Math.abs(Math.floor(Math.sin(seed * 12.9898 + index * 78.233) * 0xffffff))
  const sequence = seed.toString(36).toUpperCase().padStart(4, "0")
  return `TX-${sequence}-${value.toString(16).toUpperCase().padStart(6, "0").slice(0, 4)}`
}

function hashText(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash
}

function pseudoRandom(seed: number, salt: number) {
  return Math.abs(Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453) % 1
}

function pickHub(seed: number, salt: number) {
  return mockHubs[Math.floor(pseudoRandom(seed, salt) * mockHubs.length) % mockHubs.length]
}

function pickCounterparty(seed: number, source: MockHub) {
  let target = pickHub(seed, 7)
  let attempts = 0
  while (target.city === source.city && attempts < 6) {
    target = pickHub(seed + attempts + 1, 11 + attempts)
    attempts += 1
  }
  return target
}

function withAmount(hub: MockHub, amount: number, currency = hub.currency, chain?: string): FlowPoint {
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

function createTransaction(seed: number, slotIndex: number, statusOverride?: Transaction["status"]): Transaction {
  const t = seed * 0.73
  const sourceHub = pickHub(seed + slotIndex * 3, 3)
  const targetHub = pickCounterparty(seed + slotIndex * 5, sourceHub)
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

function initialTransactions(maxTransactions: number): Transaction[] {
  return Array.from({ length: maxTransactions }, (_, slotIndex) => {
    const seed = maxTransactions - slotIndex
    return createTransaction(seed, slotIndex)
  })
}

function trimTransactions(transactions: Transaction[], maxTransactions: number) {
  return transactions.slice(0, clamp(Math.round(maxTransactions), 1, 300))
}

function appendLiveTransaction(transactions: Transaction[], seed: number, maxTransactions: number) {
  return trimTransactions([createTransaction(seed, 0, createdStatus(seed)), ...transactions], maxTransactions)
}

function nextStatus(transaction: Transaction, seed: number): Transaction["status"] {
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

function etaForStatus(status: Transaction["status"], seed: number, currentEta: string) {
  if (status === "settled" || status === "failed") return "00:00"
  if (status === "routing") return formatEta(20 + pseudoRandom(seed, 71) * 160)
  return currentEta
}

function applyLifecycleUpdate(transactions: Transaction[], seed: number) {
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

function nextPools(t: number): PoolMetric[] {
  return poolNames.map((name, index) => ({
    name,
    utilization: Math.round(clamp(72 + wave(t, index * 1.2, 0.45) * 13 + wave(t, index, 1.4) * 4, 42, 96)),
  }))
}

export function useLiveDashboard({
  maxTransactions,
  streamIntervalMs = 1400,
}: LiveDashboardOptions): LiveDashboard {
  const normalizedMax = clamp(Math.round(maxTransactions), 1, 300)
  const [tick, setTick] = useState(() => performance.now())
  const sequenceRef = useRef(normalizedMax)
  const [transactions, setTransactions] = useState(() => initialTransactions(normalizedMax))

  useEffect(() => {
    setTransactions((current) => {
      if (current.length === normalizedMax) return current
      if (current.length > normalizedMax) return trimTransactions(current, normalizedMax)

      const missing = normalizedMax - current.length
      const additions = Array.from({ length: missing }, (_, index) => {
        sequenceRef.current += 1
        return createTransaction(sequenceRef.current, current.length + index)
      })
      return [...current, ...additions]
    })
  }, [normalizedMax])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick(performance.now())
    }, 700)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      sequenceRef.current += 1
      setTransactions((current) => appendLiveTransaction(current, sequenceRef.current, normalizedMax))
    }, streamIntervalMs)
    return () => window.clearInterval(interval)
  }, [normalizedMax, streamIntervalMs])

  useEffect(() => {
    const interval = window.setInterval(() => {
      sequenceRef.current += 1
      setTransactions((current) => applyLifecycleUpdate(current, sequenceRef.current))
    }, Math.max(900, Math.round(streamIntervalMs * 0.85)))
    return () => window.clearInterval(interval)
  }, [streamIntervalMs])

  return useMemo(() => {
    const t = tick / 1000
    const totalVisible = transactions.reduce((sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount), 0)

    return {
      transactions,
      volume24h: totalVisible * (34.5 + wave(t, 1.4, 0.08) * 2.2),
      volumeChange: 24 + wave(t, 0.2, 0.32) * 8 + wave(t, 2.8, 0.71) * 2,
      medianSettlementSeconds: 58 + wave(t, 1.1, 0.36) * 19 + wave(t, 3.2, 0.9) * 6,
      pools: nextPools(t),
      railUptime: 99.84 + wave(t, 0.7, 0.2) * 0.08,
      activeFlows: transactions.filter((tx) => tx.status === "routing").length,
    }
  }, [tick, transactions])
}
