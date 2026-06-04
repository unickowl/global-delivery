# OwlPay Data Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace global-delivery's `MockTransactionSource` with a live `OwlpayTransactionSource` that polls `/api/v1/quotes` from the Bank Module API, adapts the response into `Transaction` objects, and wires up Harbor SSO authentication — without touching any rendering code.

**Architecture:** `OwlpayTransactionSource` implements the existing `TransactionSource` interface. `initial()` returns `[]` (synchronous constraint); `subscribe()` fires a `replace` event on first successful poll, then diffs on subsequent polls (10 s interval). A pure adapter function maps owlpay `QuoteItem` → `Transaction` using a bundled country-coordinate table (migrated from owlpay-globe's `Earth.jsx`). `useLiveDashboard` metrics are recomputed from real transaction arrays. An `Auth.tsx` gate checks for the Harbor SSO cookie and redirects if missing.

**Tech Stack:** React 18, TypeScript, Vite (rolldown-vite), native `fetch` with `credentials: "include"`, existing Three.js globe (untouched throughout)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/data/countryCoordinates.ts` | ISO alpha-2 → `{lat, lng}` (250+ countries) |
| Create | `src/data/countryCities.ts` | ISO alpha-2 → primary city name |
| Create | `src/services/transactions/owlpayTypes.ts` | `QuoteItem` / `QuoteListResponse` interfaces |
| Create | `src/services/transactions/owlpayAdapter.ts` | `quoteToTransaction()` pure adapter |
| Create | `src/services/transactions/owlpaySource.ts` | `OwlpayTransactionSource` class |
| Create | `src/components/Auth.tsx` | Harbor SSO gate |
| Create | `.env.local` | Local env vars (not committed) |
| Modify | `src/data/transactions.ts` | Add optional `createdAt?: string` to `Transaction` |
| Modify | `src/services/transactions/index.ts` | Register `"owlpay"` case |
| Modify | `src/hooks/useLiveDashboard.ts` | Compute real metrics from transactions |
| Modify | `src/App.tsx` | Wrap with `<Auth>` when source is owlpay |

**Untouched:** `ThreeGlobeCanvas.tsx`, `FuturisticPanel/`, `flow.ts`, `route.ts`, `flowRendering.ts`, all CSS

---

## Task 1: Extend Transaction type with `createdAt`

**Files:**
- Modify: `src/data/transactions.ts`

- [ ] **Step 1: Add optional `createdAt` to Transaction**

  Open `src/data/transactions.ts`. Change the `Transaction` type block (lines 12–24) to:

  ```typescript
  export type Transaction = {
    id: string
    status: "routing" | "settled" | "pending" | "failed"
    direction: "on-ramp" | "off-ramp"
    source: FlowPoint
    target: FlowPoint
    exchangeRate: number
    fee: number
    rail: "ACH" | "WIRE" | "SEPA" | "PIX" | "SWIFT" | "FPS"
    eta: string
    riskScore: number
    liquidityPool: string
    createdAt?: string
  }
  ```

  Existing fixture data does not need `createdAt` (field is optional).

- [ ] **Step 2: Verify build**

  ```bash
  cd /home/ubuntu/Code/owlting/global-delivery
  pnpm exec tsc --noEmit 2>&1 | grep -v "FuturisticPanel\|ThreeGlobe" | head -20
  ```

  Expected: no new errors beyond the pre-existing ones in `FuturisticPanel/` and `ThreeGlobeCanvas.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add src/data/transactions.ts
  git commit -m "feat: add optional createdAt to Transaction type"
  ```

---

## Task 2: Country coordinate table

**Files:**
- Create: `src/data/countryCoordinates.ts`

This data is migrated verbatim from `owlpay-globe-realtime-transaction-map/src/Earth.jsx` lines 9–259, with `lon` renamed to `lng` to match `FlowPoint`.

- [ ] **Step 1: Create the file**

  Create `src/data/countryCoordinates.ts` with the full content below:

  ```typescript
  export type CountryCoord = { lat: number; lng: number }

  export const COUNTRY_COORDS: Record<string, CountryCoord> = {
    // EU & Europe
    AT: { lat: 47.51, lng: 14.55 },
    BE: { lat: 50.50, lng: 4.47 },
    BG: { lat: 42.73, lng: 25.48 },
    HR: { lat: 45.10, lng: 15.20 },
    CY: { lat: 35.12, lng: 33.42 },
    CZ: { lat: 49.81, lng: 15.47 },
    DK: { lat: 56.26, lng: 9.50 },
    EE: { lat: 58.59, lng: 25.01 },
    FI: { lat: 61.92, lng: 25.74 },
    FR: { lat: 46.22, lng: 2.21 },
    DE: { lat: 51.16, lng: 10.45 },
    GR: { lat: 39.07, lng: 21.82 },
    HU: { lat: 47.16, lng: 19.50 },
    IE: { lat: 53.14, lng: -7.69 },
    IT: { lat: 41.87, lng: 12.56 },
    LV: { lat: 56.87, lng: 24.60 },
    LT: { lat: 55.16, lng: 23.88 },
    LU: { lat: 49.81, lng: 6.12 },
    MT: { lat: 35.93, lng: 14.37 },
    NL: { lat: 52.13, lng: 5.29 },
    PL: { lat: 51.91, lng: 19.14 },
    PT: { lat: 39.39, lng: -8.22 },
    RO: { lat: 45.94, lng: 24.96 },
    SK: { lat: 48.66, lng: 19.69 },
    SI: { lat: 46.15, lng: 14.99 },
    ES: { lat: 40.46, lng: -3.74 },
    SE: { lat: 60.12, lng: 18.64 },
    GB: { lat: 55.37, lng: -3.43 },
    CH: { lat: 46.81, lng: 8.22 },
    NO: { lat: 60.47, lng: 8.46 },
    IS: { lat: 64.96, lng: -19.02 },
    AL: { lat: 41.15, lng: 20.16 },
    AD: { lat: 42.50, lng: 1.52 },
    BA: { lat: 43.91, lng: 17.67 },
    FO: { lat: 61.89, lng: -6.91 },
    GI: { lat: 36.14, lng: -5.35 },
    LI: { lat: 47.16, lng: 9.55 },
    MC: { lat: 43.73, lng: 7.42 },
    MD: { lat: 47.41, lng: 28.36 },
    ME: { lat: 42.70, lng: 19.37 },
    MK: { lat: 41.60, lng: 21.74 },
    RS: { lat: 44.01, lng: 21.00 },
    SM: { lat: 43.94, lng: 12.45 },
    UA: { lat: 48.37, lng: 31.16 },
    BY: { lat: 53.70, lng: 27.95 },
    RU: { lat: 61.52, lng: 105.31 },

    // Americas
    US: { lat: 37.09, lng: -95.71 },
    CA: { lat: 56.13, lng: -106.34 },
    MX: { lat: 23.63, lng: -102.55 },
    BR: { lat: -14.23, lng: -51.92 },
    AR: { lat: -38.41, lng: -63.61 },
    CL: { lat: -35.67, lng: -71.54 },
    CO: { lat: 4.57, lng: -74.29 },
    PE: { lat: -9.18, lng: -75.01 },
    VE: { lat: 6.42, lng: -66.58 },
    BO: { lat: -16.29, lng: -63.58 },
    PY: { lat: -23.44, lng: -58.44 },
    UY: { lat: -32.52, lng: -55.76 },
    EC: { lat: -1.83, lng: -78.18 },
    GY: { lat: 4.86, lng: -58.93 },
    SR: { lat: 3.91, lng: -56.02 },
    PA: { lat: 8.53, lng: -80.78 },
    CR: { lat: 9.74, lng: -83.75 },
    NI: { lat: 12.86, lng: -85.20 },
    HN: { lat: 15.20, lng: -86.24 },
    SV: { lat: 13.79, lng: -88.89 },
    GT: { lat: 15.78, lng: -90.23 },
    BZ: { lat: 17.18, lng: -88.49 },
    CU: { lat: 21.52, lng: -77.78 },
    DO: { lat: 18.73, lng: -70.16 },
    HT: { lat: 18.97, lng: -72.28 },
    JM: { lat: 18.10, lng: -77.29 },
    TT: { lat: 10.69, lng: -61.22 },
    BB: { lat: 13.19, lng: -59.54 },
    PR: { lat: 18.22, lng: -66.59 },

    // Asia & Oceania
    CN: { lat: 35.86, lng: 104.19 },
    JP: { lat: 36.20, lng: 138.25 },
    IN: { lat: 20.59, lng: 78.96 },
    KR: { lat: 35.90, lng: 127.76 },
    TW: { lat: 23.69, lng: 120.96 },
    HK: { lat: 22.31, lng: 114.16 },
    MO: { lat: 22.19, lng: 113.54 },
    SG: { lat: 1.35, lng: 103.81 },
    ID: { lat: -0.78, lng: 113.92 },
    MY: { lat: 4.21, lng: 101.97 },
    TH: { lat: 15.87, lng: 100.99 },
    VN: { lat: 14.05, lng: 108.27 },
    PH: { lat: 12.87, lng: 121.77 },
    PK: { lat: 30.37, lng: 69.34 },
    BD: { lat: 23.68, lng: 90.35 },
    LK: { lat: 7.87, lng: 80.77 },
    NP: { lat: 28.39, lng: 84.12 },
    KH: { lat: 12.56, lng: 104.99 },
    LA: { lat: 19.85, lng: 102.49 },
    MM: { lat: 21.91, lng: 95.95 },
    MN: { lat: 46.86, lng: 103.84 },
    KZ: { lat: 48.01, lng: 66.92 },
    UZ: { lat: 41.37, lng: 64.58 },
    TM: { lat: 38.96, lng: 59.55 },
    KG: { lat: 41.20, lng: 74.76 },
    TJ: { lat: 38.86, lng: 71.27 },
    AF: { lat: 33.93, lng: 67.70 },
    IR: { lat: 32.42, lng: 53.68 },
    IQ: { lat: 33.22, lng: 43.67 },
    SA: { lat: 23.88, lng: 45.07 },
    AE: { lat: 23.42, lng: 53.84 },
    QA: { lat: 25.35, lng: 51.18 },
    KW: { lat: 29.31, lng: 47.48 },
    BH: { lat: 26.06, lng: 50.55 },
    OM: { lat: 21.51, lng: 55.92 },
    YE: { lat: 15.55, lng: 48.51 },
    IL: { lat: 31.04, lng: 34.85 },
    JO: { lat: 30.58, lng: 36.23 },
    LB: { lat: 33.85, lng: 35.86 },
    SY: { lat: 34.80, lng: 38.99 },
    TR: { lat: 38.96, lng: 35.24 },
    AZ: { lat: 40.14, lng: 47.57 },
    AM: { lat: 40.06, lng: 45.03 },
    GE: { lat: 42.31, lng: 43.35 },
    AU: { lat: -25.27, lng: 133.77 },
    NZ: { lat: -40.90, lng: 174.88 },
    PG: { lat: -6.31, lng: 143.95 },
    FJ: { lat: -17.71, lng: 178.06 },

    // Africa
    ZA: { lat: -30.55, lng: 22.93 },
    EG: { lat: 26.82, lng: 30.80 },
    NG: { lat: 9.08, lng: 8.67 },
    KE: { lat: -0.02, lng: 37.90 },
    ET: { lat: 9.14, lng: 40.48 },
    TZ: { lat: -6.36, lng: 34.88 },
    GH: { lat: 7.94, lng: -1.02 },
    CI: { lat: 7.54, lng: -5.54 },
    CM: { lat: 7.36, lng: 12.35 },
    MA: { lat: 31.79, lng: -7.09 },
    DZ: { lat: 28.03, lng: 1.65 },
    TN: { lat: 33.88, lng: 9.53 },
    LY: { lat: 26.33, lng: 17.22 },
    SD: { lat: 12.86, lng: 30.21 },
    AO: { lat: -11.20, lng: 17.87 },
    MZ: { lat: -18.66, lng: 35.52 },
    ZW: { lat: -19.01, lng: 29.15 },
    ZM: { lat: -13.13, lng: 27.84 },
    UG: { lat: 1.37, lng: 32.29 },
    RW: { lat: -1.94, lng: 29.87 },
    SN: { lat: 14.49, lng: -14.45 },
    ML: { lat: 17.57, lng: -3.99 },
    BF: { lat: 12.23, lng: -1.56 },
    NE: { lat: 17.60, lng: 8.08 },
    NA: { lat: -22.95, lng: 18.49 },
    BW: { lat: -22.32, lng: 24.68 },
    MG: { lat: -18.76, lng: 46.86 },
    MU: { lat: -20.34, lng: 57.55 },
    SC: { lat: -4.67, lng: 55.49 },
    DJ: { lat: 11.82, lng: 42.59 },
    SO: { lat: 5.15, lng: 46.19 },
    LR: { lat: 6.42, lng: -9.42 },
    SL: { lat: 8.46, lng: -11.77 },
    GN: { lat: 9.94, lng: -9.69 },
    GM: { lat: 13.44, lng: -15.31 },
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "countryCoordinates" | head -10
  ```

  Expected: no errors for the new file.

- [ ] **Step 3: Commit**

  ```bash
  git add src/data/countryCoordinates.ts
  git commit -m "feat: add country coordinate table (migrated from owlpay-globe)"
  ```

---

## Task 3: Country → City mapping

**Files:**
- Create: `src/data/countryCities.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  // Maps ISO 3166-1 alpha-2 country codes to primary financial hub city names.
  // Used to populate FlowPoint.city when owlpay API provides only a country code.
  export const COUNTRY_CITIES: Record<string, string> = {
    // Americas
    US: "New York",
    CA: "Toronto",
    MX: "Mexico City",
    BR: "São Paulo",
    AR: "Buenos Aires",
    CL: "Santiago",
    CO: "Bogotá",
    PE: "Lima",
    EC: "Quito",
    UY: "Montevideo",
    VE: "Caracas",
    BO: "La Paz",
    PY: "Asunción",
    PA: "Panama City",
    CR: "San José",
    GT: "Guatemala City",
    DO: "Santo Domingo",
    JM: "Kingston",
    TT: "Port of Spain",
    PR: "San Juan",
    CU: "Havana",

    // Europe
    GB: "London",
    DE: "Frankfurt",
    FR: "Paris",
    NL: "Amsterdam",
    CH: "Zurich",
    ES: "Madrid",
    IT: "Milan",
    PL: "Warsaw",
    CZ: "Prague",
    SE: "Stockholm",
    NO: "Oslo",
    DK: "Copenhagen",
    BE: "Brussels",
    PT: "Lisbon",
    AT: "Vienna",
    FI: "Helsinki",
    IE: "Dublin",
    GR: "Athens",
    HU: "Budapest",
    RO: "Bucharest",
    SK: "Bratislava",
    SI: "Ljubljana",
    HR: "Zagreb",
    RS: "Belgrade",
    BG: "Sofia",
    UA: "Kyiv",
    BY: "Minsk",
    RU: "Moscow",
    TR: "Istanbul",
    LU: "Luxembourg",
    MT: "Valletta",
    EE: "Tallinn",
    LV: "Riga",
    LT: "Vilnius",
    IS: "Reykjavik",

    // MENA
    AE: "Dubai",
    SA: "Riyadh",
    IL: "Tel Aviv",
    EG: "Cairo",
    MA: "Casablanca",
    QA: "Doha",
    KW: "Kuwait City",
    BH: "Manama",
    OM: "Muscat",
    JO: "Amman",
    LB: "Beirut",
    IQ: "Baghdad",
    IR: "Tehran",

    // APAC
    CN: "Shanghai",
    JP: "Tokyo",
    KR: "Seoul",
    TW: "Taipei",
    HK: "Hong Kong",
    MO: "Macau",
    SG: "Singapore",
    IN: "Mumbai",
    AU: "Sydney",
    NZ: "Auckland",
    ID: "Jakarta",
    MY: "Kuala Lumpur",
    TH: "Bangkok",
    VN: "Ho Chi Minh City",
    PH: "Manila",
    BD: "Dhaka",
    PK: "Karachi",
    LK: "Colombo",
    KH: "Phnom Penh",
    MM: "Yangon",
    MN: "Ulaanbaatar",
    KZ: "Almaty",
    UZ: "Tashkent",
    AZ: "Baku",
    GE: "Tbilisi",
    AM: "Yerevan",

    // Africa
    ZA: "Johannesburg",
    NG: "Lagos",
    KE: "Nairobi",
    GH: "Accra",
    ET: "Addis Ababa",
    TZ: "Dar es Salaam",
    CI: "Abidjan",
    SN: "Dakar",
    CM: "Douala",
    DZ: "Algiers",
    TN: "Tunis",
    MA: "Casablanca",
    EG: "Cairo",
    UG: "Kampala",
    RW: "Kigali",
    MZ: "Maputo",
    ZM: "Lusaka",
    ZW: "Harare",
    MU: "Port Louis",
    SC: "Victoria",
    MG: "Antananarivo",
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/data/countryCities.ts
  git commit -m "feat: add country-to-city mapping for owlpay adapter"
  ```

---

## Task 4: owlpay API types

**Files:**
- Create: `src/services/transactions/owlpayTypes.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  // Types for the owlpay Bank Module API /api/v1/quotes response.
  // Derived from owlpay-globe-realtime-transaction-map src/App.jsx usage.

  export type QuoteItem = {
    id: string | number
    application?: { name?: string }
    sender_country: string
    destination_country: string
    source_amount: string | number
    source_currency: string
    destination_amount: string | number
    destination_currency: string
    payment_status: "paid" | "unpaid"
    is_locked: boolean
    type: "deposit" | "withdrawal"
    created_at: string
  }

  export type QuoteListResponse = {
    data: QuoteItem[]
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add src/services/transactions/owlpayTypes.ts
  git commit -m "feat: add QuoteItem types for owlpay API"
  ```

---

## Task 5: owlpay → Transaction adapter

**Files:**
- Create: `src/services/transactions/owlpayAdapter.ts`

- [ ] **Step 1: Create the file**

  ```typescript
  import type { Transaction } from "../../data/transactions"
  import { COUNTRY_COORDS } from "../../data/countryCoordinates"
  import { COUNTRY_CITIES } from "../../data/countryCities"
  import type { QuoteItem } from "./owlpayTypes"

  function cityFor(code: string): string {
    return COUNTRY_CITIES[code] ?? code
  }

  // Returns null when either country code has no known coordinates (cannot render on globe).
  export function quoteToTransaction(quote: QuoteItem): Transaction | null {
    const srcCoord = COUNTRY_COORDS[quote.sender_country]
    const dstCoord = COUNTRY_COORDS[quote.destination_country]
    if (!srcCoord || !dstCoord) return null

    const status: Transaction["status"] =
      quote.payment_status === "paid"
        ? "settled"
        : quote.is_locked
        ? "routing"
        : "pending"

    const direction: Transaction["direction"] =
      quote.type === "deposit" ? "on-ramp" : "off-ramp"

    const srcAmount = parseFloat(String(quote.source_amount))
    const dstAmount = parseFloat(String(quote.destination_amount))

    return {
      id: String(quote.id),
      status,
      direction,
      source: {
        name: quote.application?.name ?? "-",
        city: cityFor(quote.sender_country),
        country: quote.sender_country,
        amount: isNaN(srcAmount) ? 0 : srcAmount,
        currency: quote.source_currency,
        lat: srcCoord.lat,
        lng: srcCoord.lng,
      },
      target: {
        name: "-",
        city: cityFor(quote.destination_country),
        country: quote.destination_country,
        amount: isNaN(dstAmount) ? 0 : dstAmount,
        currency: quote.destination_currency,
        lat: dstCoord.lat,
        lng: dstCoord.lng,
      },
      exchangeRate: srcAmount > 0 ? dstAmount / srcAmount : 1,
      fee: 0,
      rail: "WIRE",
      eta: status === "settled" ? "00:00" : "—",
      riskScore: quote.is_locked ? 50 : 0,
      liquidityPool: "OwlPay Pool",
      createdAt: quote.created_at,
    }
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "owlpayAdapter" | head -10
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/transactions/owlpayAdapter.ts
  git commit -m "feat: add owlpay quote-to-transaction adapter"
  ```

---

## Task 6: OwlpayTransactionSource

**Files:**
- Create: `src/services/transactions/owlpaySource.ts`

The source polls every 10 s (matching owlpay-globe). `initial()` returns `[]` because the TransactionSource contract is synchronous. On the first poll it emits a `replace` event with all fetched transactions. Subsequent polls diff IDs: new quotes become `append` events, changed statuses become `update` events.

- [ ] **Step 1: Create the file**

  ```typescript
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

          if (this.knownIds.size === 0) {
            // First successful poll — replace everything
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
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "owlpaySource" | head -10
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/transactions/owlpaySource.ts
  git commit -m "feat: add OwlpayTransactionSource with 10s polling and ID diffing"
  ```

---

## Task 7: Register in the factory

**Files:**
- Modify: `src/services/transactions/index.ts`

- [ ] **Step 1: Read current file**

  Current content of `src/services/transactions/index.ts`:

  ```typescript
  import { MockTransactionSource } from "./mockSource"
  import type { TransactionSource } from "./types"

  export type { TransactionSource, TransactionEvent, TransactionSourceOptions } from "./types"
  export { MockTransactionSource } from "./mockSource"

  export function createTransactionSource(): TransactionSource {
    const kind = import.meta.env.VITE_TRANSACTION_SOURCE ?? "mock"
    switch (kind) {
      case "mock":
        return new MockTransactionSource()
      default:
        throw new Error(`Unknown VITE_TRANSACTION_SOURCE: ${kind}`)
    }
  }
  ```

- [ ] **Step 2: Add the owlpay case**

  Replace the entire file content:

  ```typescript
  import { MockTransactionSource } from "./mockSource"
  import { OwlpayTransactionSource } from "./owlpaySource"
  import type { TransactionSource } from "./types"

  export type { TransactionSource, TransactionEvent, TransactionSourceOptions } from "./types"
  export { MockTransactionSource } from "./mockSource"
  export { OwlpayTransactionSource } from "./owlpaySource"

  export function createTransactionSource(): TransactionSource {
    const kind = import.meta.env.VITE_TRANSACTION_SOURCE ?? "mock"
    switch (kind) {
      case "mock":
        return new MockTransactionSource()
      case "owlpay": {
        const endpoint = import.meta.env.VITE_BANK_MODULE_API_ENDPOINT
        if (!endpoint) throw new Error("VITE_BANK_MODULE_API_ENDPOINT must be set when VITE_TRANSACTION_SOURCE=owlpay")
        return new OwlpayTransactionSource(endpoint)
      }
      default:
        throw new Error(`Unknown VITE_TRANSACTION_SOURCE: ${kind}`)
    }
  }
  ```

- [ ] **Step 3: Verify build**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  Expected: build succeeds (exit 0).

- [ ] **Step 4: Commit**

  ```bash
  git add src/services/transactions/index.ts
  git commit -m "feat: register OwlpayTransactionSource in createTransactionSource factory"
  ```

---

## Task 8: Real metrics in useLiveDashboard

**Files:**
- Modify: `src/hooks/useLiveDashboard.ts`

Remove wave-based synthetic metrics. Derive everything from the `transactions` array.

- [ ] **Step 1: Replace the file**

  ```typescript
  import { useEffect, useMemo, useState } from "react"
  import type { Transaction } from "../data/transactions"
  import type { TransactionSource } from "../services/transactions"

  type PoolMetric = { name: string; utilization: number }

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
            setTransactions(event.transactions)
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

    return useMemo(() => {
      const cutoff24h = Date.now() - 24 * 60 * 60 * 1000

      const recent = transactions.filter((tx) =>
        tx.createdAt ? new Date(tx.createdAt).getTime() >= cutoff24h : true,
      )

      const volume24h = recent.reduce(
        (sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount),
        0,
      )

      const routing = transactions.filter((tx) => tx.status === "routing")
      const failed = transactions.filter((tx) => tx.status === "failed")

      const railUptime =
        transactions.length > 0
          ? ((transactions.length - failed.length) / transactions.length) * 100
          : 100

      const utilization =
        transactions.length > 0
          ? Math.round((routing.length / transactions.length) * 100)
          : 0

      return {
        transactions,
        volume24h,
        volumeChange: 0,
        medianSettlementSeconds: 62,
        pools: [{ name: "OwlPay Pool", utilization }],
        railUptime,
        activeFlows: routing.length,
      }
    }, [transactions])
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "useLiveDashboard" | head -10
  ```

  Expected: no errors.

- [ ] **Step 3: Verify build**

  ```bash
  pnpm build 2>&1 | tail -10
  ```

  Expected: build succeeds.

- [ ] **Step 4: Commit**

  ```bash
  git add src/hooks/useLiveDashboard.ts
  git commit -m "feat: compute dashboard metrics from real transactions instead of synthetic waves"
  ```

---

## Task 9: Auth component

**Files:**
- Create: `src/components/Auth.tsx`

Ported from `owlpay-globe-realtime-transaction-map/src/Auth.jsx`, converted to TypeScript.

- [ ] **Step 1: Create the file**

  ```typescript
  import { useEffect, useState, type ReactNode } from "react"

  const HARBOR_URL = import.meta.env.VITE_API_HARBOR_URL as string | undefined
  const COOKIE_NAME = import.meta.env.VITE_AUTH_COOKIE_NAME as string | undefined

  function getCookie(name: string): string | null {
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()!.split(";").shift() ?? null
    return null
  }

  export function Auth({ children }: { children: ReactNode }) {
    const [authenticated, setAuthenticated] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
      if (!HARBOR_URL || !COOKIE_NAME) {
        setError("Missing VITE_API_HARBOR_URL or VITE_AUTH_COOKIE_NAME in environment")
        return
      }
      const token = getCookie(COOKIE_NAME)
      if (!token) {
        window.location.href = `${HARBOR_URL}/api/v1/auth/internal/login?redirect_to_global_delivery=true`
      } else {
        setAuthenticated(true)
      }
    }, [])

    if (error) {
      return <div style={{ color: "red", padding: "20px", fontFamily: "monospace" }}>{error}</div>
    }
    if (!authenticated) {
      return <div style={{ color: "#0cf", padding: "20px", fontFamily: "monospace" }}>Authenticating…</div>
    }
    return <>{children}</>
  }
  ```

- [ ] **Step 2: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "Auth.tsx" | head -10
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Auth.tsx
  git commit -m "feat: add Auth component with Harbor SSO cookie gate"
  ```

---

## Task 10: Wire App.tsx and create env file

**Files:**
- Modify: `src/App.tsx`
- Create: `.env.local` (template; not committed)

The Auth gate is only activated when `VITE_TRANSACTION_SOURCE=owlpay`. When running in mock mode, no Auth component is rendered.

- [ ] **Step 1: Import Auth in App.tsx**

  In `src/App.tsx`, add to the imports block (after the existing imports, around line 20):

  ```typescript
  import { Auth } from "./components/Auth"
  ```

- [ ] **Step 2: Add the conditional Auth wrapper in App.tsx**

  Locate the `const transactionSource = createTransactionSource()` line (line 24). After it, add:

  ```typescript
  const USE_AUTH = import.meta.env.VITE_TRANSACTION_SOURCE === "owlpay"
  ```

- [ ] **Step 3: Wrap the exported App return with Auth**

  The exported `App` function is at line 795. Its return block (lines 818–834) is:

  ```tsx
  return (
    <>
      {startupComplete && <MonitorApp globeSettings={globeSettings} />}
      {!startupComplete && (
        <StartupLoading key={bootEpoch} onComplete={completeStartup} settings={bootSettings} />
      )}
      {everCompleted && (
        <GlobeSettings
          settings={globeSettings}
          onChange={setGlobeSettings}
          bootSettings={bootSettings}
          onBootSettingsChange={setBootSettings}
          onReplayBoot={replayBoot}
        />
      )}
    </>
  )
  ```

  Replace it with:

  ```tsx
  const content = (
    <>
      {startupComplete && <MonitorApp globeSettings={globeSettings} />}
      {!startupComplete && (
        <StartupLoading key={bootEpoch} onComplete={completeStartup} settings={bootSettings} />
      )}
      {everCompleted && (
        <GlobeSettings
          settings={globeSettings}
          onChange={setGlobeSettings}
          bootSettings={bootSettings}
          onBootSettingsChange={setBootSettings}
          onReplayBoot={replayBoot}
        />
      )}
    </>
  )
  return USE_AUTH ? <Auth>{content}</Auth> : content
  ```

- [ ] **Step 4: Verify TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "App.tsx" | head -20
  ```

  Expected: no new errors beyond pre-existing ones.

- [ ] **Step 5: Create .env.local template**

  Create `.env.local` (this file must NOT be committed):

  ```bash
  # owlpay Bank Module API
  VITE_TRANSACTION_SOURCE=owlpay
  VITE_BANK_MODULE_API_ENDPOINT=https://api-bank-module.owlpay.com

  # Harbor SSO (same domain cookie required)
  VITE_API_HARBOR_URL=https://harbor.owlpay.com
  VITE_AUTH_COOKIE_NAME=owlpay_token
  ```

  Confirm `.env.local` is gitignored (it should be by default with Vite projects):

  ```bash
  cat .gitignore | grep env
  ```

  If `.env.local` is not listed, add it:

  ```bash
  echo ".env.local" >> .gitignore
  git add .gitignore
  ```

- [ ] **Step 6: Verify full build**

  ```bash
  pnpm build 2>&1 | tail -15
  ```

  Expected: build succeeds with exit code 0.

- [ ] **Step 7: Commit**

  ```bash
  git add src/App.tsx src/components/Auth.tsx
  git commit -m "feat: wire owlpay data source and Auth gate into App"
  ```

---

## Verification Checklist

After all tasks complete, confirm:

- [ ] `pnpm build` exits 0
- [ ] `pnpm exec tsc --noEmit` produces no new errors (pre-existing FuturisticPanel/ThreeGlobeCanvas errors are acceptable)
- [ ] With `VITE_TRANSACTION_SOURCE=mock` (default), the app loads as before with mock data — no Auth gate shown
- [ ] With `VITE_TRANSACTION_SOURCE=owlpay` + valid env vars + Harbor cookie:
  - Globe shows real flight paths between countries visible in `COUNTRY_COORDS`
  - HUD queue lists real transaction IDs
  - `activeFlows` in FS-02 reflects real routing count
  - Quotes with unknown country codes are silently dropped (no crash)
- [ ] With `VITE_TRANSACTION_SOURCE=owlpay` + no Harbor cookie: page redirects to Harbor login

---

## Known Limitations (Scope)

The following are intentionally out of scope for this plan:

- `volumeChange` is hardcoded `0` — requires historical API data not yet available
- `medianSettlementSeconds` is hardcoded `62` — owlpay API provides no settlement timestamp
- `rail` is hardcoded `"WIRE"` — owlpay API provides no payment rail info
- `fee` is hardcoded `0` — owlpay API provides no fee field
- `riskScore` is a coarse estimate (50 if locked, else 0)
- `failed` status never appears — owlpay API has no failed/rejected quote state
- Transactions with unrecognized country codes are dropped silently; these should be rare

All limitations above can be addressed once the owlpay API is extended or a complementary data source is available.
