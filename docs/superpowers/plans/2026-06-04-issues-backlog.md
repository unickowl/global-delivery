# Issues Backlog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six correctness/performance/UX issues identified in post-development review, and write collaborator documentation for known data gaps.

**Architecture:** All fixes are surgical and isolated — no interface changes, no new abstractions. Each task touches one file. The documentation task produces a new file in `docs/`.

**Tech Stack:** React 18 / TypeScript (frontend), PHP / Laravel (seeder)

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `src/services/transactions/owlpaySource.ts` | Map lookup, bounded memory, surge logging, backlog threshold |
| Modify | `src/services/transactions/owlpayAdapter.ts` | Log unknown rail values, log dropped country codes |
| Modify | `src/App.tsx` | Guard FS-05 / FocusTelemetry from showing mock selected data |
| Modify | `owlpay_bank_module/database/seeders/MockQuoteSeeder.php` | Idempotent seeder |
| Create | `docs/known-issues.md` | Collaborator notes on data gaps |

---

## Task 1: O(1) diff lookup + bounded memory in owlpaySource

**Files:**
- Modify: `src/services/transactions/owlpaySource.ts` (lines 82–113)

The trickle-mode diff loop calls `current.find((t) => t.id === tx.id)` inside a `for` loop — O(n²) for 100 items. Fix by building a `Map` once before the loop.

`current` and `knownIds` also grow unboundedly across polls. After each poll, rebuild `knownIds` from `current` so it never tracks IDs that have aged out of the active window.

- [ ] **Step 1: Replace `find` with Map lookup, rebuild knownIds after each poll**

  In `src/services/transactions/owlpaySource.ts`, replace the `else` branch of the `if (surgeMode)` block (lines 98–113) with:

  ```typescript
        } else {
          // Build an O(1) lookup for status-change detection.
          const currentById = new Map(current.map((t) => [t.id, t]))

          // Normal trickle mode: status changes fire immediately, new IDs queue up.
          for (const tx of next) {
            if (!this.knownIds.has(tx.id)) {
              this.knownIds.add(tx.id)
              trickleQueue.push(tx)
            } else {
              const prev = currentById.get(tx.id)
              if (prev && prev.status !== tx.status) {
                onEvent({ kind: "update", transaction: tx })
              }
            }
          }
          current = next.concat(current.filter((t) => !nextById.has(t.id)))
          this.cache = current
          // Keep knownIds bounded: only track IDs in the active window.
          this.knownIds = new Set(current.map((t) => t.id))
        }
  ```

  Also apply the same knownIds reset to the surge branch (line 93–96). After `current = next.concat(...)`:

  ```typescript
          current = next.concat(current.filter((t) => !nextById.has(t.id)))
          this.cache = current
          this.knownIds = new Set(current.map((t) => t.id))  // ← add this line
          onEvent({ kind: "replace", transactions: current })
  ```

- [ ] **Step 2: Verify build**

  ```bash
  cd /home/ubuntu/Code/owlting/global-delivery
  pnpm build 2>&1 | grep -E "built|error"
  ```

  Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/transactions/owlpaySource.ts
  git commit -m "perf: O(1) diff lookup, bounded knownIds after each poll"
  ```

---

## Task 2: Surge threshold — reduce false positives from small backlog

**Files:**
- Modify: `src/services/transactions/owlpaySource.ts` (line 82)

`hasBacklog = trickleQueue.length > 0` triggers surge mode when even 1 item is still in the queue, which happens routinely between polls. Use a threshold of 2 to absorb normal timing jitter.

- [ ] **Step 1: Change the backlog threshold**

  On line 82, change:

  ```typescript
  const hasBacklog = trickleQueue.length > 0
  ```

  to:

  ```typescript
  const hasBacklog = trickleQueue.length > 2
  ```

- [ ] **Step 2: Verify build**

  ```bash
  pnpm build 2>&1 | grep -E "built|error"
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/transactions/owlpaySource.ts
  git commit -m "fix: relax surge backlog threshold to > 2 to reduce false positives"
  ```

---

## Task 3: Observability — log surge, unknown rail, dropped country codes

**Files:**
- Modify: `src/services/transactions/owlpaySource.ts` (surge branch)
- Modify: `src/services/transactions/owlpayAdapter.ts` (railFor, quoteToTransaction)

Silent failures are the hardest bugs to diagnose in production. Every path that discards data or falls back silently needs a log.

- [ ] **Step 1: Log surge activation in owlpaySource**

  In `owlpaySource.ts`, immediately before `trickleQueue.length = 0` in the surge branch (line 94), add:

  ```typescript
          console.warn(
            `[OwlpaySource] surge mode: backlog=${trickleQueue.length} new=${newTxs.length} — emitting replace snapshot`,
          )
  ```

- [ ] **Step 2: Log unknown payment_method in railFor**

  In `owlpayAdapter.ts`, change the `railFor` function's `default` case:

  ```typescript
  function railFor(method: string | null | undefined): Transaction["rail"] {
    const m = (method ?? "").toLowerCase()
    switch (m) {
      case "ach":   return "ACH"
      case "sepa":  return "SEPA"
      case "pix":   return "PIX"
      case "swift": return "SWIFT"
      case "fps":   return "FPS"
      case "wire":
      case "crypto":
      case "":      return "WIRE"
      default:
        console.warn(`[owlpayAdapter] unknown payment_method "${method}" — defaulting to WIRE`)
        return "WIRE"
    }
  }
  ```

  Note: `wire` and `crypto` are explicitly handled without warning (known expected values).

- [ ] **Step 3: Log dropped quotes due to missing country coords**

  In `owlpayAdapter.ts`, change the early-return guard in `quoteToTransaction`:

  ```typescript
  export function quoteToTransaction(quote: QuoteItem): Transaction | null {
    const srcCoord = COUNTRY_COORDS[quote.sender_country]
    const dstCoord = COUNTRY_COORDS[quote.destination_country]
    if (!srcCoord || !dstCoord) {
      const missing = [
        !srcCoord && quote.sender_country,
        !dstCoord && quote.destination_country,
      ].filter(Boolean).join(", ")
      console.warn(`[owlpayAdapter] dropping quote ${quote.id} — no coordinates for: ${missing}`)
      return null
    }
  ```

- [ ] **Step 4: Verify build**

  ```bash
  pnpm build 2>&1 | grep -E "built|error"
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/services/transactions/owlpaySource.ts src/services/transactions/owlpayAdapter.ts
  git commit -m "obs: log surge mode, unknown rail values, and dropped country codes"
  ```

---

## Task 4: Guard FS-05 / FocusTelemetry from showing mock selected data

**Files:**
- Modify: `src/App.tsx` (lines 589–595, ~729, ~753)

When `live.transactions` is empty (owlpay source not yet loaded), `selected` falls back to `baseTransactions[0]` — a hardcoded mock transaction. This mock data (`TX-8F31A9`) can briefly appear in FS-05 TRACK and FocusTelemetry in production.

The fix: only render these panels when at least one real transaction exists.

- [ ] **Step 1: Guard FocusTelemetry (line ~729)**

  Find the line:
  ```tsx
  {mode === "focus" && <FocusTelemetry key={selected.id} transaction={selected} forceCollapsed={cardsCollapsed} />}
  ```

  Change to:
  ```tsx
  {mode === "focus" && live.transactions.length > 0 && <FocusTelemetry key={selected.id} transaction={selected} forceCollapsed={cardsCollapsed} />}
  ```

- [ ] **Step 2: Guard FS-05 TRACK detail stats (line ~753)**

  Find the `{({ active, loading }) => loading ? <PanelLoading ...> : active ? (` block for FS-05. Change its inner condition from:

  ```tsx
  loading ? <PanelLoading label="loading track" /> : active ? (
    <>
      <div className="detail-route">
  ```

  to:

  ```tsx
  loading ? <PanelLoading label="loading track" /> : active && live.transactions.length > 0 ? (
    <>
      <div className="detail-route">
  ```

- [ ] **Step 3: Verify build + TypeScript**

  ```bash
  pnpm exec tsc --noEmit 2>&1 | grep "App.tsx" | grep -v "FuturisticPanel\|ThreeGlobe" | head -10
  pnpm build 2>&1 | grep -E "built|error"
  ```

  Expected: no new errors, build succeeds.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "fix: hide FS-05 and FocusTelemetry when no real transactions loaded yet"
  ```

---

## Task 5: Idempotent MockQuoteSeeder

**Files:**
- Modify: `owlpay_bank_module/database/seeders/MockQuoteSeeder.php`

Re-running the seeder adds another Application and 60 more quotes each time. It should be safe to run multiple times.

- [ ] **Step 1: Replace the `run()` method**

  In `database/seeders/MockQuoteSeeder.php`, replace the `run()` method with:

  ```php
  public function run(): void
  {
      // Idempotent: truncate quotes and use or create the mock application.
      DB::table('quotes')->delete();

      $appId = DB::table('applications')
          ->where('name', 'MockPay Global')
          ->value('id');

      if (!$appId) {
          $appId = DB::table('applications')->insertGetId([
              'name'                  => 'MockPay Global',
              'enable_aml_strict_mode'=> 0,
              'api_key'               => encrypt('mock-api-key-' . Str::random(16)),
              'api_key_suffix'        => 'MOCK1',
              'description'           => 'Mock application for local development',
              'is_active'             => 1,
              'created_at'            => now(),
              'updated_at'            => now(),
          ]);
      }

      $now = now();
      $monthStart = now()->startOfMonth();
      $quotes = [];

      for ($i = 0; $i < 60; $i++) {
          $corridor = $this->corridors[$i % count($this->corridors)];
          [$sender, $dest, $srcCurrency, $dstCurrency, $type] = $corridor;

          $srcRate  = $this->rates[$srcCurrency] ?? 1.0;
          $dstRate  = $this->rates[$dstCurrency] ?? 1.0;

          $usdValue      = mt_rand(500, 250000);
          $srcAmount     = round($usdValue / $srcRate, 2);
          $dstAmount     = round($usdValue / $dstRate * (1 - 0.005), 2);
          $exchangeRate  = round($srcRate / $dstRate, 6);
          $feeAmount     = round($usdValue * 0.005, 2);

          $fraction  = $i / 60;
          $secondsIntoMonth = (int) ($fraction * ($now->timestamp - $monthStart->timestamp));
          $createdAt = $monthStart->copy()->addSeconds($secondsIntoMonth);

          $quotes[] = [
              'uuid'                      => Str::uuid()->toString(),
              'provider'                  => 'owlting',
              'external_quote_id'         => 'MOCK-' . strtoupper(Str::random(8)),
              'payment_method_type'       => in_array($srcCurrency, ['USDC','USDT']) ? 'crypto' : 'wire',
              'gas_fee_payer'             => 'owlpay',
              'type'                      => $type,
              'application_id'            => $appId,
              'sender_country'            => $sender,
              'destination_country'       => $dest,
              'amount_side'               => 'source',
              'source_amount'             => $srcAmount,
              'source_currency'           => $srcCurrency,
              'destination_amount'        => $dstAmount,
              'destination_currency'      => $dstCurrency,
              'exchange_rate'             => $exchangeRate,
              'exchange_pair'             => "{$srcCurrency}/{$dstCurrency}",
              'owlpay_fees_total_amount'  => $feeAmount,
              'owlpay_fees_currency'      => 'USD',
              'fees_total_amount'         => $feeAmount,
              'fees_total_currency'       => 'USD',
              'fiat_settlement_time_min'  => 1,
              'fiat_settlement_time_max'  => 3,
              'fiat_settlement_time_unit' => 'day',
              'created_at'               => $createdAt,
              'updated_at'               => $createdAt,
          ];
      }

      DB::table('quotes')->insert($quotes);

      $this->command->info("MockQuoteSeeder: upserted 1 application + " . count($quotes) . " quotes.");
  }
  ```

- [ ] **Step 2: Run seeder twice and verify count stays at 60**

  ```bash
  cd /home/ubuntu/Code/owlting/owlpay_bank_module
  docker-compose exec -T laravel.test php artisan db:seed --class=MockQuoteSeeder
  docker-compose exec -T laravel.test php artisan db:seed --class=MockQuoteSeeder
  docker-compose exec -T mysql mysql -usail -ppassword owlpay_bank_module \
    -e "SELECT COUNT(*) as quotes, (SELECT COUNT(*) FROM applications WHERE name='MockPay Global') as apps FROM quotes;"
  ```

  Expected output:
  ```
  quotes  apps
  60      1
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add database/seeders/MockQuoteSeeder.php
  git commit -m "fix: make MockQuoteSeeder idempotent (truncate + firstOrCreate application)"
  ```

---

## Task 6: Write collaborator documentation

**Files:**
- Create: `docs/known-issues.md` (in `global-delivery`)

- [ ] **Step 1: Create the file**

  Content is in the adjacent section below. Write to:
  `/home/ubuntu/Code/owlting/global-delivery/docs/known-issues.md`

- [ ] **Step 2: Commit**

  ```bash
  cd /home/ubuntu/Code/owlting/global-delivery
  git add docs/known-issues.md
  git commit -m "docs: add known-issues.md with country code, volume, and data gap notes"
  ```

---

## Verification Checklist

After all tasks:

- [ ] `pnpm build` exits 0 in `global-delivery`
- [ ] Re-running `MockQuoteSeeder` twice still yields 60 quotes and 1 application
- [ ] Open browser DevTools console: no `[owlpayAdapter] dropping quote` warnings for normal corridors (US, SG, JP, TW, etc.)
- [ ] In browser, look for `[OwlpaySource] surge mode` warning only when actually switching to surge (not on every poll)
- [ ] FS-05 TRACK and FocusTelemetry are empty/hidden during the brief loading window, not showing mock `TX-8F31A9`
