import type { Transaction } from "../data/transactions"

// Representative data shaped like the REAL exposed API (QuoteHistoryResource) +
// the local seeder: every quote is a fiat <-> stablecoin on/off-ramp.
//  - deposit  (on-ramp):  source = fiat,       destination = stablecoin
//  - withdrawal (off-ramp): source = stablecoin, destination = fiat
// The stablecoin leg still carries a real country (and coordinates); only its
// currency is a stablecoin. Chain is NOT exposed by the API, so it is absent.

type Country = { name: string; lat: number; lng: number }

const C: Record<string, Country> = {
  US: { name: "United States", lat: 39.8, lng: -98.6 },
  SG: { name: "Singapore", lat: 1.35, lng: 103.8 },
  JP: { name: "Japan", lat: 36.2, lng: 138.3 },
  TW: { name: "Taiwan", lat: 23.7, lng: 121.0 },
  HK: { name: "Hong Kong", lat: 22.3, lng: 114.2 },
  GB: { name: "United Kingdom", lat: 54.0, lng: -2.0 },
  DE: { name: "Germany", lat: 51.2, lng: 10.4 },
  BR: { name: "Brazil", lat: -14.2, lng: -51.9 },
  IN: { name: "India", lat: 22.0, lng: 79.0 },
  AE: { name: "United Arab Emirates", lat: 24.0, lng: 54.0 },
  PH: { name: "Philippines", lat: 12.9, lng: 121.7 },
  MX: { name: "Mexico", lat: 23.6, lng: -102.5 },
}

// Units of currency per 1 USD (stablecoins ~ 1:1).
const PER_USD: Record<string, number> = {
  USDC: 1, USDT: 1, USD: 1, JPY: 156, TWD: 32, HKD: 7.8, GBP: 0.79,
  EUR: 0.92, BRL: 5.1, INR: 83.2, PHP: 57.4, MXN: 17.1,
}

type CorridorTemplate = {
  from: string; fromCur: string
  to: string; toCur: string
  type: Transaction["direction"] // on-ramp = deposit, off-ramp = withdrawal
  rail: Transaction["rail"]
  weight: number
}

const CORRIDORS: CorridorTemplate[] = [
  { from: "US", fromCur: "USD", to: "SG", toCur: "USDC", type: "on-ramp", rail: "WIRE", weight: 6 },
  { from: "SG", fromCur: "USDC", to: "US", toCur: "USD", type: "off-ramp", rail: "ACH", weight: 4 },
  { from: "JP", fromCur: "JPY", to: "SG", toCur: "USDC", type: "on-ramp", rail: "SWIFT", weight: 4 },
  { from: "TW", fromCur: "TWD", to: "SG", toCur: "USDC", type: "on-ramp", rail: "SWIFT", weight: 3 },
  { from: "HK", fromCur: "HKD", to: "US", toCur: "USDC", type: "on-ramp", rail: "WIRE", weight: 3 },
  { from: "GB", fromCur: "GBP", to: "SG", toCur: "USDC", type: "on-ramp", rail: "FPS", weight: 3 },
  { from: "DE", fromCur: "EUR", to: "SG", toCur: "USDC", type: "on-ramp", rail: "SEPA", weight: 4 },
  { from: "BR", fromCur: "BRL", to: "US", toCur: "USDC", type: "on-ramp", rail: "PIX", weight: 4 },
  { from: "IN", fromCur: "INR", to: "AE", toCur: "USDT", type: "on-ramp", rail: "SWIFT", weight: 3 },
  { from: "AE", fromCur: "USDT", to: "IN", toCur: "INR", type: "off-ramp", rail: "SWIFT", weight: 2 },
  { from: "PH", fromCur: "PHP", to: "US", toCur: "USDC", type: "on-ramp", rail: "WIRE", weight: 2 },
  { from: "MX", fromCur: "MXN", to: "US", toCur: "USDC", type: "on-ramp", rail: "ACH", weight: 3 },
  { from: "US", fromCur: "USDC", to: "PH", toCur: "PHP", type: "off-ramp", rail: "WIRE", weight: 3 },
  { from: "US", fromCur: "USDC", to: "BR", toCur: "BRL", type: "off-ramp", rail: "PIX", weight: 3 },
]

const TOTAL_WEIGHT = CORRIDORS.reduce((s, c) => s + c.weight, 0)

function pickCorridor(): CorridorTemplate {
  let r = Math.random() * TOTAL_WEIGHT
  for (const c of CORRIDORS) {
    r -= c.weight
    if (r <= 0) return c
  }
  return CORRIDORS[0]
}

function pickStatus(): Transaction["status"] {
  const r = Math.random()
  if (r < 0.55) return "settled" // paid
  if (r < 0.75) return "routing" // locked / in-flight
  return "pending" // unpaid, waiting
}

const HOUR = 60 * 60 * 1000

function pickCreatedAt(status: Transaction["status"], now: number): string {
  if (status === "pending") {
    const ageH = Math.random() < 0.7 ? Math.random() * 2 : 2 + Math.random() * 9
    return new Date(now - ageH * HOUR).toISOString()
  }
  return new Date(now - Math.random() * 24 * HOUR).toISOString()
}

export function makeMockTransactions(count = 52, now = Date.now()): Transaction[] {
  const out: Transaction[] = []
  for (let i = 0; i < count; i++) {
    const c = pickCorridor()
    const status = pickStatus()
    const from = C[c.from]
    const to = C[c.to]
    const usdNotional = mtRandUsd()
    const srcAmount = round2(usdNotional * (PER_USD[c.fromCur] ?? 1))
    const dstAmount = round2(usdNotional * (PER_USD[c.toCur] ?? 1) * (1 - 0.005))
    out.push({
      id: `Q-${(now % 1_000_000).toString(36).toUpperCase()}-${i.toString().padStart(3, "0")}`,
      status,
      direction: c.type,
      source: { name: "-", city: "", country: from.name, amount: srcAmount, currency: c.fromCur, lat: from.lat, lng: from.lng },
      target: { name: "-", city: "", country: to.name, amount: dstAmount, currency: c.toCur, lat: to.lat, lng: to.lng },
      exchangeRate: srcAmount > 0 ? round4(dstAmount / srcAmount) : 1,
      fee: 0,
      rail: c.rail,
      eta: "00:00",
      riskScore: 0,
      liquidityPool: "OwlPay Pool",
      createdAt: pickCreatedAt(status, now),
    })
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
}

function mtRandUsd() {
  return 500 + Math.random() * 250_000
}
function round2(n: number) {
  return Math.round(n * 100) / 100
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000
}
