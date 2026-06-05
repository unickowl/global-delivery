# Live Dashboard Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound OwlPay transaction memory and React render spikes, then reduce per-frame allocations in the globe render loop.

**Architecture:** Separate OwlPay source state into capped active transactions, capped cache output, and a bounded dedupe ID window that is not tied to the visible UI buffer. Keep React replace events capped defensively. Move frame-loop transaction lookup allocations behind a cache that refreshes only when the `transactions` array reference changes.

**Tech Stack:** React, TypeScript, Vite, Vitest, Three.js.

---

## File Structure

- Modify: `src/services/transactions/owlpaySource.ts`
  - Owns OwlPay polling, trickle queue, surge mode, local cache, and dedupe state.
  - Add small helpers for cap normalization, active-buffer merge, and bounded known-ID rebuild.
- Create: `src/services/transactions/owlpaySource.test.ts`
  - Covers first poll capping, dedupe across API snapshots larger than UI buffer, replace capping, and cache capping.
- Modify: `src/hooks/useLiveDashboard.ts`
  - Keep replace-event defensive slicing.
- Create: `src/hooks/useLiveDashboard.test.tsx`
  - Verifies `replace` events cannot push more than `maxTransactions` into hook state.
- Modify: `src/components/globe/lib/flow.ts`
  - Stop rebuilding transaction `Set` / `Map` on every animation frame.
  - Accept a reusable lookup/cache object from the canvas layer, or expose a cache helper next to `updateFlows`.
- Modify: `src/components/globe/lib/flowRendering.ts`
  - Replace the three per-frame `flows.slice(0, renderFlowCount(settings))` (in `lineSegmentsFromFlows`, `shimmerSegmentsFromFlows`, `failedSegmentsFromFlows`) with bounded loops (see Task 4 Step 3b). Leave `largeTrailSegmentsFromFlows` alone — it has no slice.
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`
  - Store flow transaction lookup cache in a ref and refresh only when `transactions` reference changes.
- Create or modify: `src/components/globe/lib/flow.test.ts`
  - Covers cache refresh behavior and verifies active ID lookup stays behaviorally equivalent.

---

## Task 1: OwlPay Source Tests for Bounded Buffers and Dedupe

**Files:**
- Create: `src/services/transactions/owlpaySource.test.ts`
- Modify only if needed for test setup: `vitest.config.ts`

- [ ] **Step 1: Write failing tests for active buffer cap and snapshot dedupe**

Create `src/services/transactions/owlpaySource.test.ts` with fake timers and a mocked `fetch`. Use generated quote payloads shaped like `QuoteListResponse`, and assert source behavior through emitted `TransactionEvent`s.

Required test cases:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OwlpayTransactionSource } from "./owlpaySource"
import type { QuoteItem, QuoteListResponse } from "./owlpayTypes"
import type { TransactionEvent } from "./types"

// IMPORTANT: field names must match the real `QuoteItem` shape and the codes
// must exist in `COUNTRY_COORDS` — otherwise `quoteToTransaction` returns null
// for every quote (drops them all) and the source emits empty arrays, which
// would make these tests fail for the wrong reason.
function makeQuote(id: string): QuoteItem {
  return {
    id,
    application: { name: "Acme" },
    sender_country: "US",        // present in COUNTRY_COORDS
    destination_country: "TW",   // present in COUNTRY_COORDS
    source_amount: "100",
    source_currency: "USD",
    destination_amount: "3100",
    destination_currency: "TWD",
    payment_status: "unpaid",
    is_locked: false,
    type: "withdrawal",
    created_at: "2026-06-05T00:00:00.000Z",
    payment_method: "wire",
  }
}

function makeResponse(ids: string[]): QuoteListResponse {
  return { data: ids.map(makeQuote) }
}

async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("OwlpayTransactionSource", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("caps first replace and cache to maxTransactions", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeResponse(ids),
    }))

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    unsubscribe()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: "replace" })
    expect(events[0].kind === "replace" ? events[0].transactions : []).toHaveLength(20)
    expect(source.initial({ maxTransactions: 300 })).toHaveLength(20)
  })

  it("does not re-emit unchanged API snapshot items outside the visible buffer as new", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(ids) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(ids) })
    vi.stubGlobal("fetch", fetchMock)

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushMicrotasks()
    unsubscribe()

    expect(events.filter((event) => event.kind === "replace")).toHaveLength(1)
    expect(events.filter((event) => event.kind === "append")).toHaveLength(0)
  })

  it("caps surge replace output when many new quotes arrive", async () => {
    const firstIds = Array.from({ length: 100 }, (_, i) => `quote-${i}`)
    const secondIds = Array.from({ length: 100 }, (_, i) => `new-${i}`)
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(firstIds) })
      .mockResolvedValueOnce({ ok: true, json: async () => makeResponse(secondIds) }))

    const source = new OwlpayTransactionSource("https://example.test")
    const events: TransactionEvent[] = []
    const unsubscribe = source.subscribe({ maxTransactions: 20 }, (event) => events.push(event))

    await flushMicrotasks()
    await vi.advanceTimersByTimeAsync(10_000)
    await flushMicrotasks()
    unsubscribe()

    const replaceEvents = events.filter((event): event is Extract<TransactionEvent, { kind: "replace" }> => event.kind === "replace")
    expect(replaceEvents).toHaveLength(2)
    expect(replaceEvents[1].transactions).toHaveLength(20)
    expect(source.initial({ maxTransactions: 300 })).toHaveLength(20)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail before implementation**

Run:

```bash
pnpm test:run src/services/transactions/owlpaySource.test.ts
```

Expected: at least the dedupe test fails against a naive `.slice(0, cap)` implementation that **also caps `knownIds` to the buffer** — because then IDs 21–100 of an unchanged 100-item page fall outside the 20-item known set every poll and are re-detected as new (constant surge). This is the whole reason Task 2 keeps the dedupe window (`knownIds`) decoupled from the visible buffer cap. (With the default Buffer Size 200 ≥ per_page 100 the bug is masked; the test uses Buffer Size 20 to expose it.)

---

## Task 2: Implement Bounded OwlPay Source State

> **Note:** an interim quick-cap may already be in the tree — `const cap = options.maxTransactions` plus `.slice(0, cap)` on the merges, with `knownIds` rebuilt from `current` only. That version bounds memory but **caps the dedupe window to the buffer** (the bug Task 1's dedupe test targets). The helpers below supersede it: they keep the cap *and* decouple `knownIds`. Match against whatever is currently in the file rather than a pristine baseline.

**Files:**
- Modify: `src/services/transactions/owlpaySource.ts`
- Test: `src/services/transactions/owlpaySource.test.ts`

- [ ] **Step 1: Add cap and merge helpers**

Add helpers near the constants:

```ts
// Keep in sync with the globe's MAX_FLOWS (globe/lib/constants.ts) — the buffer
// never needs to hold more than the globe can render. Not imported here to avoid
// a services → components dependency; if MAX_FLOWS changes, update this too.
const MAX_ACTIVE_TRANSACTIONS = 300
const MAX_KNOWN_IDS = 1_000

function transactionCap(value: number) {
  return Math.min(MAX_ACTIVE_TRANSACTIONS, Math.max(1, Math.round(value)))
}

function mergeActiveTransactions(
  next: Transaction[],
  current: Transaction[],
  cap: number,
) {
  const nextById = new Set(next.map((t) => t.id))
  return next.concat(current.filter((t) => !nextById.has(t.id))).slice(0, cap)
}

function rebuildKnownIds(
  next: Transaction[],
  current: Transaction[],
  trickleQueue: Transaction[],
) {
  // Dedupe window — deliberately NOT tied to the visible buffer cap. It must
  // cover the full latest API page + the pending trickle so an unchanged page
  // larger than the buffer is not re-detected as "new" each poll.
  // Build the Set first (dedup), then bound it — bounding a pre-dedup array
  // would drop unique IDs while keeping duplicates.
  const known = new Set<string>()
  for (const t of next) known.add(t.id)
  for (const t of current) known.add(t.id)
  for (const t of trickleQueue) known.add(t.id)
  if (known.size <= MAX_KNOWN_IDS) return known
  // Safety bound for pathological sessions (never reached while `current` is
  // capped at MAX_ACTIVE_TRANSACTIONS). Insertion order keeps the newest.
  return new Set(Array.from(known).slice(0, MAX_KNOWN_IDS))
}
```

- [ ] **Step 2: Use the active cap for cache and emitted replace events**

Change `subscribe()` setup:

```ts
const cap = transactionCap(options.maxTransactions)
```

Change first poll:

```ts
firstPollDone = true
current = next.slice(0, cap)
this.knownIds = rebuildKnownIds(next, current, trickleQueue)
this.cache = current
onEvent({ kind: "replace", transactions: current })
return
```

Change both surge and normal post-poll merges:

```ts
current = mergeActiveTransactions(next, current, cap)
this.cache = current
this.knownIds = rebuildKnownIds(next, current, trickleQueue)
```

Keep surge mode clearing `trickleQueue.length = 0` before rebuilding `knownIds`.

- [ ] **Step 3: Run OwlPay source tests**

Run:

```bash
pnpm test:run src/services/transactions/owlpaySource.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run existing transaction tests**

Run:

```bash
pnpm test:run src/services/transactions
```

Expected: existing mock/generator tests still pass.

---

## Task 3: Hook-Level Replace Defense

**Files:**
- Modify: `src/hooks/useLiveDashboard.ts`
- Create: `src/hooks/useLiveDashboard.test.tsx`

- [ ] **Step 1: Keep or add defensive replace slicing**

Ensure `replace` branch is:

```ts
if (event.kind === "replace") {
  setTransactions(event.transactions.slice(0, maxTransactions))
}
```

- [ ] **Step 2: Add hook test**

Create `src/hooks/useLiveDashboard.test.tsx`:

```tsx
import { renderHook, act } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useLiveDashboard } from "./useLiveDashboard"
import type { Transaction } from "../data/transactions"
import type { TransactionEvent, TransactionSource } from "../services/transactions"

// Matches the real Transaction/FlowPoint shape (target — not destination —,
// FlowPoint fields, rail enum). No `as Transaction` cast needed.
function tx(id: string): Transaction {
  const point = (country: string, currency: string, lat: number, lng: number) => ({
    name: "-", city: "", country, amount: 100, currency, lat, lng,
  })
  return {
    id,
    status: "pending",
    direction: "on-ramp",
    source: point("United States", "USD", 40.7128, -74.006),
    target: point("Taiwan", "TWD", 25.033, 121.5654),
    exchangeRate: 31,
    fee: 0,
    rail: "WIRE",
    eta: "00:00",
    riskScore: 0,
    liquidityPool: "OwlPay Pool",
    createdAt: new Date().toISOString(),
  }
}

describe("useLiveDashboard", () => {
  it("caps replace events to maxTransactions", () => {
    let emit: ((event: TransactionEvent) => void) | undefined
    const source: TransactionSource = {
      initial: () => [],
      subscribe: (_options, onEvent) => {
        emit = onEvent
        return () => {}
      },
    }

    const { result } = renderHook(() =>
      useLiveDashboard({ source, maxTransactions: 3 }),
    )

    act(() => {
      emit?.({
        kind: "replace",
        transactions: [tx("1"), tx("2"), tx("3"), tx("4"), tx("5")],
      })
    })

    expect(result.current.transactions.map((item) => item.id)).toEqual(["1", "2", "3"])
  })
})
```

- [ ] **Step 3: Run hook test**

Run:

```bash
pnpm test:run src/hooks/useLiveDashboard.test.tsx
```

Expected: test passes.

---

## Task 4: Flow Lookup Cache for Render Loop

**Files:**
- Modify: `src/components/globe/lib/flow.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`
- Create or modify: `src/components/globe/lib/flow.test.ts`

- [ ] **Step 1: Add a transaction lookup cache type and builder**

In `src/components/globe/lib/flow.ts`, add:

```ts
export type FlowTransactionLookup = {
  transactions: Transaction[]
  activeTransactions: Transaction[]
  activeIds: Set<string>
  transactionById: Map<string, Transaction>
}

export function buildFlowTransactionLookup(
  transactions: Transaction[],
  settings: GlobeSettingsState,
): FlowTransactionLookup {
  const activeTransactions = transactions.slice(0, renderFlowCount(settings))
  return {
    transactions,
    activeTransactions,
    activeIds: new Set(activeTransactions.map((tx) => tx.id)),
    transactionById: new Map(activeTransactions.map((tx) => [tx.id, tx])),
  }
}
```

- [ ] **Step 2: Change `updateFlows` to use the cache**

Change signature from:

```ts
export function updateFlows(now: number, flows: FlowTx[], transactions: Transaction[], settings: GlobeSettingsState, lastAddRef: MutableRefObject<number>) {
```

to:

```ts
export function updateFlows(now: number, flows: FlowTx[], lookup: FlowTransactionLookup, settings: GlobeSettingsState, lastAddRef: MutableRefObject<number>) {
```

Inside the function, replace per-frame allocations:

```ts
const activeTransactions = lookup.activeTransactions
const activeIds = lookup.activeIds
const transactionById = lookup.transactionById
```

Remove local construction of `new Set(...)` and `new Map(...)`.

- [ ] **Step 3: Store cache in `ThreeGlobeCanvas`**

In `src/components/globe/ThreeGlobeCanvas.tsx`, import `buildFlowTransactionLookup` and create refs:

```ts
const flowLookupRef = useRef(buildFlowTransactionLookup(transactions, globeSettings))
const flowLookupInputRef = useRef({
  transactions,
  flowCount: globeSettings.flowCount,
  renderFlowCap: globeSettings.renderFlowCap,
})
```

Before calling `updateFlows` in the animation loop, refresh only when inputs change. The key must include **`renderFlowCap`** (not just `flowCount`): `renderFlowCount()` is `min(flowCount, renderFlowCap)`, and `fullPerformance` (cards collapsed) raises `renderFlowCap` — without it the active slice could go stale.

```ts
const li = flowLookupInputRef.current
if (
  li.transactions !== current.transactions ||
  li.flowCount !== current.globeSettings.flowCount ||
  li.renderFlowCap !== current.globeSettings.renderFlowCap
) {
  flowLookupRef.current = buildFlowTransactionLookup(current.transactions, current.globeSettings)
  flowLookupInputRef.current = {
    transactions: current.transactions,
    flowCount: current.globeSettings.flowCount,
    renderFlowCap: current.globeSettings.renderFlowCap,
  }
}

updateFlows(now, flowsRef.current, flowLookupRef.current, globeSettings, lastAddRef)
```

- [ ] **Step 3b: Remove the other per-frame slices in `flowRendering.ts`**

`updateFlows` is not the only per-frame allocator. **Three** segment builders in
`src/components/globe/lib/flowRendering.ts` — `lineSegmentsFromFlows`,
`shimmerSegmentsFromFlows`, and `failedSegmentsFromFlows` — each run
`flows.slice(0, renderFlowCount(settings))` **every frame** (a throwaway array per
call). Replace each of those three slices with a bounded loop over `flows`:

```ts
const targetCount = renderFlowCount(settings)
const limit = Math.min(flows.length, targetCount)
for (let i = 0; i < limit; i++) {
  const flow = flows[i]
  // ...existing body...
}
```

**Do NOT touch `largeTrailSegmentsFromFlows`** — it has no `flows.slice` and does
not call `renderFlowCount`; leave its current behavior unchanged.

(The segment arrays these functions *return* are still allocated each frame —
that's the geometry payload; reusing those buffers is a deeper Three.js
optimization, out of scope here. This step only removes the three redundant input slices.)

- [ ] **Step 4: Add flow cache behavior test**

Add to `src/components/globe/lib/flow.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { buildFlowTransactionLookup } from "./flow"
import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../ArcOverlay"

function tx(id: string): Transaction {
  return { id } as Transaction
}

// renderFlowCount() clamps to a MINIMUM of 20 — so the test must use ≥ 20
// flows/transactions to actually exercise the cap, and the cap value must be
// ≥ 20 to take effect. flowCount:2 would NOT yield 2 active; it yields 20.
const settings = { flowCount: 20, renderFlowCap: 20 } as GlobeSettingsState

describe("buildFlowTransactionLookup", () => {
  it("limits the active set to renderFlowCount", () => {
    const txs = Array.from({ length: 25 }, (_, i) => tx(`tx-${i}`))
    const lookup = buildFlowTransactionLookup(txs, settings)

    expect(lookup.activeTransactions).toHaveLength(20)
    expect(lookup.activeTransactions.map((t) => t.id)).toEqual(
      txs.slice(0, 20).map((t) => t.id),
    )
    expect(lookup.activeIds.has("tx-0")).toBe(true)
    expect(lookup.activeIds.has("tx-19")).toBe(true)
    expect(lookup.activeIds.has("tx-20")).toBe(false) // beyond the 20 cap
    expect(lookup.transactionById.get("tx-5")?.id).toBe("tx-5")
  })
})
```

- [ ] **Step 5: Run flow tests**

Run:

```bash
pnpm test:run src/components/globe/lib/flow.test.ts
```

Expected: test passes.

---

## Task 5: Evaluate HUD Metrics Before Optimizing Further

**Files:**
- Inspect: `src/App.tsx`
- Inspect: `src/services/transactions/monitorMetrics.ts`
- Modify only if profiling still shows HUD cost after Tasks 1-4.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test:run
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm run build
```

Expected: build succeeds.

- [ ] **Step 3: Manual performance check**

Run the app with OwlPay simulation enabled or a mock API that returns 100 quotes and set Buffer Size to 20, 200, and 300.

Expected checks:
- `live.transactions.length` never exceeds selected Buffer Size.
- `source.initial({ maxTransactions: 300 })` never exceeds the active cap from the running subscription.
- Console does not emit repeated surge warnings for an unchanged 100-item API snapshot with Buffer Size 20.
- Globe animation continues while trickle events arrive.

- [ ] **Step 4: Only if HUD remains expensive, add memoized incremental metrics**

If React profiling shows `deriveMonitorMetrics(live.transactions)` is still a bottleneck after buffers are capped, create a dedicated hook in `src/hooks/useMonitorMetrics.ts`:

```ts
import { useMemo } from "react"
import type { Transaction } from "../data/transactions"
import { deriveMonitorMetrics } from "../services/transactions/monitorMetrics"

export function useMonitorMetrics(transactions: Transaction[]) {
  return useMemo(() => deriveMonitorMetrics(transactions), [transactions])
}
```

Then replace in `src/App.tsx`:

```ts
const metrics = useMonitorMetrics(live.transactions)
```

Do not implement incremental metrics unless profiling proves this hook is still insufficient; capped buffers make the current O(n) scan acceptable for 20-300 transactions.

---

## Verification Summary

Run these commands before declaring the work complete:

```bash
pnpm test:run src/services/transactions/owlpaySource.test.ts
pnpm test:run src/hooks/useLiveDashboard.test.tsx
pnpm test:run src/components/globe/lib/flow.test.ts
pnpm test:run
pnpm run build
```

Expected final state:
- OwlPay `current` and `cache` are bounded.
- React never receives uncapped `replace` state.
- `knownIds` remains bounded but still covers the full latest API snapshot and pending trickle queue.
- Unchanged API pages larger than the UI buffer do not repeatedly trigger surge mode.
- Render loop no longer allocates the transaction ID `Set`/`Map` per frame (`updateFlows`), nor the three input slices per frame (`flowRendering.ts`).

## Preconditions & Out of Scope

- **Test tooling is already present** — `package.json` has `test` / `test:run` (vitest) and `@testing-library/react`; no setup needed. (Note: `CLAUDE.md` still says "No test framework is configured" — that line is stale and should be corrected so contributors don't skip tests.)
- **Test fixtures must match real types** — `makeQuote` uses the real `QuoteItem` field names (`sender_country`/`destination_country`/`source_amount`/`destination_amount`/`payment_status`/`is_locked`/`type`) and codes that exist in `COUNTRY_COORDS`; `tx()` uses the real `Transaction`/`FlowPoint` shape. Mismatched fixtures make the adapter drop every quote and the tests pass/fail for the wrong reason.
- **Out of scope (separate effort):** sustained GPU cost on a 24/7 4K wall — ~160 animated arcs plus the per-panel `grain`/`glitch`/`scan` CSS animations. If targeting 4K, consider lowering `flowCount` and/or disabling some panel effects at high resolution; that is a rendering/display-load concern, not part of this data + frame-loop plan.
