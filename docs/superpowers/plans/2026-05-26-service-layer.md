# Service Layer Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract transaction data generation into a `TransactionSource` interface so the existing mock can be swapped for the Replit backend without changing UI code.

**Architecture:** Define a single async `TransactionSource` interface with two methods: `initial(count)` and `subscribe(callback)`. Provide a `MockTransactionSource` that wraps the existing logic from `useLiveDashboard.ts`. Refactor `useLiveDashboard` to take a source via parameter (defaulting to mock). A future `ReplitTransactionSource` slots in with no UI change.

**Tech Stack:** TypeScript, React 19, Vitest (new), happy-dom (new).

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `vitest.config.ts` | Create | Vitest config wired to happy-dom |
| `package.json` | Modify | Add `vitest`, `happy-dom`, `@testing-library/react`, `test` script |
| `src/services/transactions/types.ts` | Create | `TransactionSource` interface + supporting types |
| `src/services/transactions/mockHubs.ts` | Create | Static `mockHubs` array (moved from hook) |
| `src/services/transactions/generators.ts` | Create | Pure helpers: `pseudoRandom`, `hashText`, `createTransaction`, `applyLifecycleUpdate`, etc. |
| `src/services/transactions/mockSource.ts` | Create | `MockTransactionSource` class implementing the interface |
| `src/services/transactions/index.ts` | Create | Factory: `createTransactionSource()` reading `VITE_TRANSACTION_SOURCE` env |
| `src/services/transactions/generators.test.ts` | Create | Tests for pure generator functions |
| `src/services/transactions/mockSource.test.ts` | Create | Tests for `MockTransactionSource` lifecycle |
| `src/hooks/useLiveDashboard.ts` | Rewrite | Consumes a `TransactionSource`; no embedded mock logic |
| `src/App.tsx` | Modify | Pass `createTransactionSource()` into `useLiveDashboard` |

---

### Task 1: Add Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest and DOM helpers**

```bash
pnpm add -D vitest happy-dom @testing-library/react @testing-library/dom
```

Expected: `vitest`, `happy-dom`, `@testing-library/react`, `@testing-library/dom` added to `devDependencies` in `package.json`.

- [ ] **Step 2: Add `test` and `test:run` scripts**

Open `package.json` and replace the `scripts` block with:

```json
"scripts": {
  "dev": "vite --host 0.0.0.0",
  "build": "vite build",
  "preview": "vite preview --host 0.0.0.0",
  "lint": "oxlint src",
  "test": "vitest",
  "test:run": "vitest run"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
})
```

- [ ] **Step 4: Smoke-test Vitest works**

Create `src/_smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest"

describe("smoke", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `pnpm test:run`
Expected: `1 passed`. Then **delete `src/_smoke.test.ts`**.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add vitest test infrastructure"
```

---

### Task 2: Define `TransactionSource` interface

**Files:**
- Create: `src/services/transactions/types.ts`

- [ ] **Step 1: Write the interface**

```ts
import type { Transaction } from "../../data/transactions"

export type TransactionSourceOptions = {
  maxTransactions: number
  streamIntervalMs?: number
}

export type TransactionEvent =
  | { kind: "append"; transaction: Transaction }
  | { kind: "update"; transaction: Transaction }
  | { kind: "replace"; transactions: Transaction[] }

export type TransactionSourceUnsubscribe = () => void

export interface TransactionSource {
  initial(options: TransactionSourceOptions): Promise<Transaction[]>
  subscribe(
    options: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (existing errors are pre-existing, see CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
git add src/services/transactions/types.ts
git commit -m "feat(services): define TransactionSource interface"
```

---

### Task 3: Move `mockHubs` to dedicated file

**Files:**
- Create: `src/services/transactions/mockHubs.ts`

- [ ] **Step 1: Create the file**

Copy lines 30–84 of `src/hooks/useLiveDashboard.ts` (the `MockHub` type + `mockHubs` array) into `src/services/transactions/mockHubs.ts`:

```ts
import type { FlowPoint } from "../../data/transactions"

export type MockHub = Omit<FlowPoint, "amount"> & {
  baseAmount: number
  usdRate: number
  pool: string
}

export const mockHubs: MockHub[] = [
  // ...copy lines 37–83 verbatim from src/hooks/useLiveDashboard.ts
]
```

The 47 hub literals are mechanical; copy them exactly. Do NOT modify any values.

- [ ] **Step 2: Verify export shape**

```bash
pnpm exec tsc --noEmit src/services/transactions/mockHubs.ts 2>&1 | head -5
```

Expected: no errors specific to this file.

- [ ] **Step 3: Commit (do not yet remove from hook — that comes in Task 6)**

```bash
git add src/services/transactions/mockHubs.ts
git commit -m "feat(services): extract mockHubs to dedicated module"
```

---

### Task 4: Extract pure generator functions with tests

**Files:**
- Create: `src/services/transactions/generators.ts`
- Create: `src/services/transactions/generators.test.ts`

- [ ] **Step 1: Write failing tests for pure helpers**

Create `src/services/transactions/generators.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { clamp, hashText, pseudoRandom, statusFor } from "./generators"

describe("clamp", () => {
  it("returns value when in range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
  it("returns min when below", () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })
  it("returns max when above", () => {
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("hashText", () => {
  it("is deterministic", () => {
    expect(hashText("hello")).toBe(hashText("hello"))
  })
  it("differs for different inputs", () => {
    expect(hashText("a")).not.toBe(hashText("b"))
  })
})

describe("pseudoRandom", () => {
  it("returns a value in [0, 1)", () => {
    for (let seed = 1; seed < 100; seed += 1) {
      const v = pseudoRandom(seed, 7)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
  it("is deterministic", () => {
    expect(pseudoRandom(42, 7)).toBe(pseudoRandom(42, 7))
  })
})

describe("statusFor", () => {
  it("returns 'pending' for low progress", () => {
    expect(statusFor(0.1, 1)).toBe("pending")
  })
  it("returns 'routing' for mid progress", () => {
    expect(statusFor(0.5, 1)).toBe("routing")
  })
  it("returns 'settled' for high progress without failure seed", () => {
    expect(statusFor(0.9, 1)).toBe("settled")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run`
Expected: FAIL with "Cannot find module './generators'".

- [ ] **Step 3: Create `generators.ts` by extracting pure helpers from `useLiveDashboard.ts`**

Move these functions verbatim from `src/hooks/useLiveDashboard.ts` (lines 86–267) into `src/services/transactions/generators.ts`, adding `export` to each:

- `wave`, `clamp`, `statusFor`, `createdStatus`, `transactionId`, `hashText`, `pseudoRandom`
- `pickHub`, `pickCounterparty`, `withAmount`
- `createTransactionFromHubs`, `createTransaction`
- `initialTransactions`, `trimTransactions`, `appendLiveTransaction`
- `nextStatus`, `etaForStatus`, `applyLifecycleUpdate`
- `nextPools`, `poolNames`, `rails`, `stableCurrencies`, `stableChains`

Replace the inline `mockHubs` reference with `import { mockHubs, type MockHub } from "./mockHubs"`.

Add the necessary imports at the top:

```ts
import type { FlowPoint, Transaction } from "../../data/transactions"
import { formatEta } from "../../lib/utils"
import { mockHubs, type MockHub } from "./mockHubs"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run`
Expected: all 9 assertions PASS.

- [ ] **Step 5: Verify tsc still compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/transactions/generators.ts src/services/transactions/generators.test.ts
git commit -m "feat(services): extract pure transaction generators with tests"
```

---

### Task 5: Implement `MockTransactionSource`

**Files:**
- Create: `src/services/transactions/mockSource.ts`
- Create: `src/services/transactions/mockSource.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/transactions/mockSource.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"
import { MockTransactionSource } from "./mockSource"

describe("MockTransactionSource", () => {
  it("initial() returns the requested count", async () => {
    const source = new MockTransactionSource()
    const txs = await source.initial({ maxTransactions: 12 })
    expect(txs).toHaveLength(12)
    expect(txs[0]).toHaveProperty("id")
    expect(txs[0]).toHaveProperty("status")
  })

  it("clamps maxTransactions to [1, 300]", async () => {
    const source = new MockTransactionSource()
    expect((await source.initial({ maxTransactions: 0 })).length).toBe(1)
    expect((await source.initial({ maxTransactions: 9999 })).length).toBe(300)
  })

  it("subscribe() emits append events on interval", () => {
    vi.useFakeTimers()
    const source = new MockTransactionSource()
    const events: string[] = []
    const unsubscribe = source.subscribe(
      { maxTransactions: 10, streamIntervalMs: 100 },
      (event) => events.push(event.kind),
    )
    vi.advanceTimersByTime(350)
    unsubscribe()
    expect(events.filter((k) => k === "append").length).toBeGreaterThanOrEqual(3)
    vi.useRealTimers()
  })

  it("subscribe() emits update events on lifecycle interval", () => {
    vi.useFakeTimers()
    const source = new MockTransactionSource()
    const events: string[] = []
    const unsubscribe = source.subscribe(
      { maxTransactions: 10, streamIntervalMs: 1000 },
      (event) => events.push(event.kind),
    )
    vi.advanceTimersByTime(3000)
    unsubscribe()
    expect(events.filter((k) => k === "update").length).toBeGreaterThanOrEqual(1)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run mockSource`
Expected: FAIL with "Cannot find module './mockSource'".

- [ ] **Step 3: Implement `MockTransactionSource`**

Create `src/services/transactions/mockSource.ts`:

```ts
import {
  applyLifecycleUpdate,
  appendLiveTransaction,
  createTransaction,
  initialTransactions,
} from "./generators"
import type {
  TransactionEvent,
  TransactionSource,
  TransactionSourceOptions,
  TransactionSourceUnsubscribe,
} from "./types"

function clampMax(value: number) {
  return Math.min(300, Math.max(1, Math.round(value)))
}

export class MockTransactionSource implements TransactionSource {
  private seed = Math.floor(Math.random() * 1_000_000)
  private sequence = this.seed

  async initial({ maxTransactions }: TransactionSourceOptions) {
    const max = clampMax(maxTransactions)
    this.sequence = this.seed + max
    return initialTransactions(max, this.seed)
  }

  subscribe(
    { maxTransactions, streamIntervalMs = 1400 }: TransactionSourceOptions,
    onEvent: (event: TransactionEvent) => void,
  ): TransactionSourceUnsubscribe {
    const max = clampMax(maxTransactions)
    let current = initialTransactions(max, this.seed)
    onEvent({ kind: "replace", transactions: current })

    const appendTimer = window.setInterval(() => {
      this.sequence += 1
      current = appendLiveTransaction(current, this.sequence, max)
      onEvent({ kind: "append", transaction: current[0] })
    }, streamIntervalMs)

    const lifecycleTimer = window.setInterval(() => {
      this.sequence += 1
      const next = applyLifecycleUpdate(current, this.sequence)
      if (next !== current) {
        const changed = next.find((tx, i) => tx !== current[i])
        current = next
        if (changed) onEvent({ kind: "update", transaction: changed })
      }
    }, Math.max(900, Math.round(streamIntervalMs * 0.85)))

    return () => {
      window.clearInterval(appendTimer)
      window.clearInterval(lifecycleTimer)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run mockSource`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/transactions/mockSource.ts src/services/transactions/mockSource.test.ts
git commit -m "feat(services): add MockTransactionSource"
```

---

### Task 6: Add source factory

**Files:**
- Create: `src/services/transactions/index.ts`

- [ ] **Step 1: Create the factory**

```ts
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

- [ ] **Step 2: Verify tsc**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/transactions/index.ts
git commit -m "feat(services): add createTransactionSource factory"
```

---

### Task 7: Rewrite `useLiveDashboard` to consume a `TransactionSource`

**Files:**
- Modify: `src/hooks/useLiveDashboard.ts` (full rewrite)

- [ ] **Step 1: Rewrite the hook**

Replace the entire file with:

```ts
import { useEffect, useMemo, useRef, useState } from "react"
import type { Transaction } from "../data/transactions"
import {
  nextPools,
  wave,
} from "../services/transactions/generators"
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
  const [tick, setTick] = useState(() => performance.now())
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    let cancelled = false
    source.initial({ maxTransactions }).then((txs) => {
      if (!cancelled) setTransactions(txs)
    })
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
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [source, maxTransactions, streamIntervalMs])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick(performance.now())
    }, 700)
    return () => window.clearInterval(interval)
  }, [])

  return useMemo(() => {
    const t = tick / 1000
    const totalVisible = transactions.reduce(
      (sum, tx) => sum + Math.max(tx.source.amount, tx.target.amount),
      0,
    )
    return {
      transactions,
      volume24h: totalVisible * (34.5 + wave(t, 1.4, 0.08) * 2.2),
      volumeChange: 24 + wave(t, 0.2, 0.32) * 8 + wave(t, 2.8, 0.71) * 2,
      medianSettlementSeconds:
        58 + wave(t, 1.1, 0.36) * 19 + wave(t, 3.2, 0.9) * 6,
      pools: nextPools(t),
      railUptime: 99.84 + wave(t, 0.7, 0.2) * 0.08,
      activeFlows: transactions.filter((tx) => tx.status === "routing").length,
    }
  }, [tick, transactions])
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds (no new errors beyond pre-existing ones).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useLiveDashboard.ts
git commit -m "refactor(hooks): rewrite useLiveDashboard to consume TransactionSource"
```

---

### Task 8: Wire `App.tsx` to the factory

**Files:**
- Modify: `src/App.tsx` (where `useLiveDashboard` is called)

- [ ] **Step 1: Find the call site**

```bash
grep -n "useLiveDashboard" src/App.tsx
```

Expected: one or two import/call lines.

- [ ] **Step 2: Update the import and call**

At the top, alongside existing imports:

```ts
import { createTransactionSource } from "./services/transactions"
```

Above the component that uses the hook (module scope, so the source is stable):

```ts
const transactionSource = createTransactionSource()
```

Replace the existing `useLiveDashboard({ maxTransactions: ... })` call with:

```ts
const live = useLiveDashboard({
  source: transactionSource,
  maxTransactions: /* keep existing value */,
})
```

- [ ] **Step 3: Verify dev server renders**

Run: `pnpm dev` (in a separate terminal if needed)
Expected: app loads, globe renders, transactions stream in (same behavior as before).

Stop the dev server.

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): wire useLiveDashboard to TransactionSource factory"
```

---

## Self-Review Checklist (run before merging)

- [ ] All 4 mock-source test cases pass: `pnpm test:run`
- [ ] All 9 generator test cases pass: `pnpm test:run`
- [ ] `pnpm build` succeeds with no new errors
- [ ] `pnpm dev` shows the same UI behavior as before this plan
- [ ] No code outside `src/services/transactions/` imports `mockHubs` or `pseudoRandom`
