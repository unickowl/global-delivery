# Data Asymmetry Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide UI fields that the quotes API architecturally cannot provide (riskScore, liquidityPool), and enrich the local seeder so status/colour/Flow-Health show realistic variety instead of all-pending.

**Architecture:** Two independent changes. (1) Frontend `App.tsx` — remove the misleading RISK/POOL telemetry. (2) Backend `MockQuoteSeeder.php` — insert a subset of `orders` rows linked to seeded quotes via `quote_id`, so the existing `QuoteHistoryService` lights up `is_locked` / `payment_status`, which the adapter maps to routing/settled.

**Tech Stack:** React/TypeScript (frontend), PHP/Laravel + Docker MySQL (seeder)

---

## Background: how status is derived (verified)

`QuoteHistoryService::getHistory()` (lines 80–88) manually attaches an `orders` relation to each Quote by matching `orders.quote_id = quotes.id` (the internal bigint `id`, NOT the uuid). `QuoteHistoryResource` then computes:

```php
$isLocked = $orders->isNotEmpty();
$paymentStatus = $isLocked ? $orders->first()->payment_status : 'unpaid';
```

The frontend `owlpayAdapter.ts` maps:
```
payment_status === "paid"  → "settled"
is_locked === true         → "routing"
otherwise                  → "pending"
```

So the only way to produce routing/settled locally is to insert `orders` rows. `riskScore` (adapter: `is_locked ? 50 : 0`) and `liquidityPool` (hardcoded "OwlPay Pool") remain architecturally fake regardless — hence they are hidden in the UI, not seeded.

---

## File Map

| Action | Path | What changes |
|--------|------|--------------|
| Modify | `global-delivery/src/App.tsx` | Remove RISK/POOL row in FocusTelemetry; FS-05 RISK stat → "—" |
| Modify | `owlpay_bank_module/database/seeders/MockQuoteSeeder.php` | Insert orders for ~60% of quotes (paid/unpaid mix) |

---

## Task 1: Hide riskScore / liquidityPool in the UI

**Files:**
- Modify: `global-delivery/src/App.tsx`

Both fields are unreliable: `liquidityPool` is hardcoded; `riskScore` is a crude `is_locked ? 50 : 0` estimate, not a real KYT score. Remove them from display, consistent with how FEE and Settlement were already hidden.

- [ ] **Step 1: Remove the RISK / POOL item from FocusTelemetry**

  In `src/App.tsx`, find this line in the `FocusTelemetry` `items` array:

  ```tsx
    ["RISK / POOL", `${transaction.riskScore} · ${transaction.liquidityPool}`],
  ```

  Delete the entire line. The `items` array will then end at the `"FX / FEE"` entry.

- [ ] **Step 2: Change FS-05 TRACK RISK stat to "—"**

  In `src/App.tsx`, find the FS-05 RISK stat block:

  ```tsx
                <div className="detail-stat">
                  <span className="ds-label">RISK</span>
                  <span className="ds-val" style={{ color: selected.riskScore < 30 ? "var(--hud-green)" : "var(--hud-yellow)" }}><ScrambleText value={selected.riskScore} /></span>
                </div>
  ```

  Replace the `ds-val` span with a static dash (no colour logic, since there is no real score):

  ```tsx
                <div className="detail-stat">
                  <span className="ds-label">RISK</span>
                  <span className="ds-val">—</span>
                </div>
  ```

- [ ] **Step 3: Verify TypeScript + build**

  ```bash
  cd /home/ubuntu/Code/owlting/global-delivery
  pnpm exec tsc --noEmit 2>&1 | grep "App.tsx" | grep -v "FuturisticPanel\|ThreeGlobe\|delay" | head -10
  pnpm build 2>&1 | grep -E "built|error"
  ```

  Expected: no new errors, `✓ built`.

  Note: after removing the `riskScore` / `liquidityPool` reads, confirm no "declared but never read" error appears. These are object properties, not local variables, so removing the reads is safe and produces no unused-variable error.

- [ ] **Step 4: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "fix: hide riskScore and liquidityPool (architecturally unavailable from quotes API)"
  ```

---

## Task 2: Seed orders to produce status variety

**Files:**
- Modify: `owlpay_bank_module/database/seeders/MockQuoteSeeder.php`

After inserting the 60 quotes, fetch their internal `id`s, then insert `orders` for a deterministic subset so the distribution is roughly:
- ~40% no order → `pending`
- ~30% order with `payment_status='unpaid'` → `routing`
- ~30% order with `payment_status='paid'` → `settled`

The `orders` table requires these NOT-NULL-no-default columns: `application_id`, `payment_status`, `transaction_uuid`, `type`, `amount_in`, `amount_in_asset`, `amount_out`, `amount_out_asset`, plus `quote_id` for the linkage. All other columns have DB defaults.

- [ ] **Step 1: Add order seeding after the quote insert**

  In `database/seeders/MockQuoteSeeder.php`, find the end of `run()`:

  ```php
        DB::table('quotes')->insert($quotes);

        $this->command->info("MockQuoteSeeder: upserted 1 application + " . count($quotes) . " quotes.");
    }
  ```

  Replace it with (inserts quotes, then seeds orders for indices where `i % 10 < 6`):

  ```php
        DB::table('quotes')->insert($quotes);

        // Reload inserted quotes to get their internal bigint ids (orders link via quote_id = quotes.id).
        $inserted = DB::table('quotes')
            ->where('application_id', $appId)
            ->orderBy('id')
            ->get(['id', 'type', 'source_amount', 'source_currency', 'destination_amount', 'destination_currency']);

        $orders = [];
        $now = now();
        foreach ($inserted->values() as $i => $q) {
            // ~40% no order (pending), ~30% unpaid (routing), ~30% paid (settled).
            $bucket = $i % 10;
            if ($bucket < 4) {
                continue; // no order → pending
            }
            $paymentStatus = $bucket < 7 ? 'unpaid' : 'paid'; // 4–6 unpaid, 7–9 paid

            $orders[] = [
                'application_id'   => $appId,
                'quote_id'         => $q->id,
                'payment_status'   => $paymentStatus,
                'transaction_uuid' => Str::uuid()->toString(),
                'type'             => $q->type,
                'amount_in'        => $q->source_amount,
                'amount_in_asset'  => $q->source_currency,
                'amount_out'       => $q->destination_amount,
                'amount_out_asset' => $q->destination_currency,
                'created_at'       => $now,
                'updated_at'       => $now,
            ];
        }

        if (!empty($orders)) {
            DB::table('orders')->insert($orders);
        }

        $this->command->info(
            "MockQuoteSeeder: upserted 1 application + " . count($quotes) . " quotes + " . count($orders) . " orders."
        );
    }
  ```

- [ ] **Step 2: Make the seeder also clear orders at the start (idempotency)**

  The seeder already does `DB::table('quotes')->delete();` at the top of `run()`. Orders reference quotes via `quote_id`, so stale orders from prior runs would linger. Add an orders delete immediately before the quotes delete.

  Find:

  ```php
        // Idempotent: clear quotes and use or create the mock application.
        DB::table('quotes')->delete();
  ```

  Replace with:

  ```php
        // Idempotent: clear orders (FK quote_id) then quotes, and use or create the mock application.
        DB::table('orders')->whereNotNull('quote_id')->delete();
        DB::table('quotes')->delete();
  ```

- [ ] **Step 3: Re-seed and verify status distribution**

  ```bash
  cd /home/ubuntu/Code/owlting/owlpay_bank_module
  docker-compose exec -T laravel.test php artisan db:seed --class=MockQuoteSeeder 2>&1 | tail -3
  ```

  Expected: `...60 quotes + 36 orders.` (indices 4–9 of each 10 → 6 per 10 → 36 of 60)

  Verify via the API that statuses now vary:

  ```bash
  curl -s "http://localhost/api/v1/quotes?per_page=100" | python3 -c "
  import sys, json
  d = json.load(sys.stdin)
  from collections import Counter
  c = Counter()
  for q in d['data']:
      if q['payment_status'] == 'paid': c['settled'] += 1
      elif q['is_locked']: c['routing'] += 1
      else: c['pending'] += 1
  print(dict(c))
  "
  ```

  Expected: a mix, roughly `{'pending': 24, 'routing': 18, 'settled': 18}` (proportions may vary slightly with the 60/30/30 split).

- [ ] **Step 4: Verify idempotency (re-run keeps counts stable)**

  ```bash
  docker-compose exec -T laravel.test php artisan db:seed --class=MockQuoteSeeder 2>&1 | tail -1
  docker-compose exec -T mysql mysql -usail -ppassword owlpay_bank_module \
    -e "SELECT (SELECT COUNT(*) FROM quotes) AS quotes, (SELECT COUNT(*) FROM orders WHERE quote_id IS NOT NULL) AS orders;" 2>/dev/null
  ```

  Expected: `quotes=60, orders=36` (not growing on repeat runs).

- [ ] **Step 5: Commit**

  ```bash
  git add database/seeders/MockQuoteSeeder.php
  git commit -m "feat: seed orders for status variety (pending/routing/settled mix)"
  ```

---

## Verification Checklist

- [ ] `pnpm build` exits 0 in `global-delivery`
- [ ] FocusTelemetry no longer shows a "RISK / POOL" row
- [ ] FS-05 TRACK shows RISK as "—"
- [ ] API `/api/v1/quotes` returns a mix of pending / routing(is_locked) / settled(paid)
- [ ] Re-running the seeder twice keeps quotes=60, orders=36
- [ ] In the browser: FS-04 QUEUE shows varied status badges (not all "pending"); Flow Health card shows a non-trivial distribution across settled/routing/pending bars
