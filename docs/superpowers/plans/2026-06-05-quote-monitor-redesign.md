# Quote Monitor Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the idealized, frontend-first monitor panels with an information architecture grounded strictly in what the live `QuoteHistoryResource` actually returns, porting the validated `src/preview/` design into the live `MonitorApp`.

**Architecture:** Promote the preview's metric layer to a shared service (`monitorMetrics.ts`), derive all panel data from `live.transactions` via `deriveMonitorMetrics`, and swap the content of the 8 HUD panels in `MonitorApp` while preserving the existing panel chrome (FuturisticPanel, boot reveal, render-prop loading states). The data adapter is unchanged — stablecoin identity is derived from the currency symbol at display time. The simulator stays as an opt-in demo (default off).

**Tech Stack:** React 18 + TypeScript, rolldown-vite, pnpm. **No test framework is configured** — verification is `pnpm exec tsc --noEmit` + `pnpm build` + `pnpm lint` + manual visual checks. State explicitly when something can only be verified visually.

---

## Decisions baked in (override at plan review before execution)

1. **Metrics location:** `src/services/transactions/monitorMetrics.ts` (shared by live + preview). `MonitorMetrics` trimmed to fields the panels use — `stablecoinMix` / `fiatMix` dropped (unused after FS-08 became rail-only and FS-09 was declined).
2. **Glow ramp CSS:** moved from the injected `<style>` into `src/styles.css` (production-grade).
3. **Adapter:** no change. `isStablecoin(currency)` at display time is sufficient; do NOT add a stablecoin field to the adapter.
4. **Simulator:** keep, default **off** (`.env.local` → `0`), add a small `SIM` badge when enabled. Synthetic shape already correct (clones a real adapted base).
5. **Preview scaffold:** kept as a dev tool, but repointed to import the shared `monitorMetrics` so it cannot drift from live.
6. **NO-COMMIT constraint is in force:** execute all tasks, run all verification, but do **not** `git commit` or perform any remote operation. Stop after Task 9 and report; commits happen only after the user confirms.

---

## File Structure

- Create: `src/services/transactions/monitorMetrics.ts` — `deriveMonitorMetrics`, `isStablecoin`, `stablecoinLeg`, `fiatCurrencyOf`, `formatAge`, types. Single source of truth for derived monitor data.
- Modify: `src/App.tsx` — replace panel content + card components, compute metrics, wire stablecoin/age into rows and track, add SIM badge.
- Modify: `src/hooks/useLiveDashboard.ts` — slim to `{ transactions }` (+ subscription plumbing); drop the old derived fields.
- Modify: `src/styles.css` — append the `rg-*` glow-ramp rules + keyframes.
- Modify: `.env.local` — `VITE_OWLPAY_SIMULATE=0`.
- Modify: `src/preview/metrics.ts` → delete; repoint `src/preview/DashboardPreview.tsx` imports to `monitorMetrics`. Keep `src/preview/mockQuotes.ts`, `preview.html`, `src/preview/main.tsx`.
- Modify: `docs/api-enrichment-roadmap.md` — record the model-has-but-Resource-omits fields.

**Canonical source for component bodies:** `src/preview/DashboardPreview.tsx` (already in-repo, validated). Tasks reference it directly rather than repeating large blocks; the transformations needed to port each into live are spelled out per task.

---

### Task 1: Promote shared metrics module

**Files:**
- Create: `src/services/transactions/monitorMetrics.ts`
- Modify: `src/preview/metrics.ts` (delete), `src/preview/DashboardPreview.tsx` (repoint import)

- [ ] **Step 1: Create `monitorMetrics.ts`** by moving the contents of `src/preview/metrics.ts` verbatim, then **removing** the now-unused fields: delete `stablecoinMix` and `fiatMix` from the `MonitorMetrics` type, from the computation block (the `stableCounts` / `fiatCounts` loops — keep `stablecoinLeg`/`fiatCurrencyOf` exports, they're used elsewhere), and from the returned object. Keep: `total, paid, locked, pending, conversionPct, onRamp, offRamp, quotedVolume, throughputRate, spanLabel, oldestPendingAgeSec, corridors, railMix, throughput`.

- [ ] **Step 2: Delete `src/preview/metrics.ts`.**

- [ ] **Step 3: Repoint preview import.** In `src/preview/DashboardPreview.tsx`, change `from "./metrics"` to `from "../services/transactions/monitorMetrics"`. (It uses `deriveMonitorMetrics, formatAge, stablecoinLeg, type ThroughputBucket` — all still exported.)

- [ ] **Step 4: Verify** — `pnpm exec tsc --noEmit 2>&1 | grep "preview/\|monitorMetrics" | grep -v styles.css` → expect no output. The preview must still typecheck against the shared module.

---

### Task 2: Move glow-ramp CSS into the global stylesheet

**Files:**
- Modify: `src/styles.css`, `src/preview/DashboardPreview.tsx`

- [ ] **Step 1: Append the `rg-*` rules** (the body of the `RAMP_GLOW_CSS` string in `DashboardPreview.tsx`) to `src/styles.css` under a new `/* ===== On/Off-Ramp glow bar ===== */` section. Strip the outer JS template literal — paste raw CSS.

- [ ] **Step 2: Remove the injected style.** In `DashboardPreview.tsx`, delete the `RAMP_GLOW_CSS` const and the `<style>{RAMP_GLOW_CSS}</style>` line inside `RampSplit`. The classes now resolve from the global sheet (preview imports `../styles.css`).

- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit`; load `preview.html` and confirm the glow bar still renders (visual; state that this is visual-only).

---

### Task 3: Add the new monitor card components to `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add new components** ported from `DashboardPreview.tsx`: `RampSplit` (glow, no `<style>`), `ThroughputSpark`, and three card components — `QuoteHealthCard` (FS-06 body), `ThroughputCard` (FS-07 body), `RailMixCard` (FS-08 body). Each takes a `MonitorMetrics` (or the slices it needs) as props.

- [ ] **Step 2: Remove the superseded helpers/components**: `FlowHealthCard`, `LiveVolumeCard`, `ChainAssetMixCard`, `deriveVolumeSeries`, `deriveMixItems`, `parseEtaSeconds`, `stablePointOf`, and the `VolumePoint` / `MixItem` types. Remove their now-unused imports (`formatEta` if unused after — check).

- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit` (the file will have unused-symbol/ref errors until Task 4 wires them; confirm the only errors are "declared but never used" for the new components, which Task 4 resolves). `pnpm lint`.

---

### Task 4: Rewire the 8 panels in `MonitorApp`

**Files:**
- Modify: `src/App.tsx` (`MonitorApp`, `TransactionRow`, `FocusTelemetry`)

- [ ] **Step 1: Compute metrics.** In `MonitorApp`, add `const metrics = useMemo(() => deriveMonitorMetrics(live.transactions), [live.transactions])` and import `deriveMonitorMetrics, formatAge, stablecoinLeg` from `monitorMetrics`. Remove `dashboardMetrics` (old deriveVolumeSeries/deriveMixItems memo).

- [ ] **Step 2: FS-00 CORE** → `OWLPAY · Quote feed live · {metrics.total} tracked · {conv}% paid` (port from preview FS-00).

- [ ] **Step 3: FS-01** label `// FLOW`; three nodes PAID / LOCKED / PENDING (port from preview FS-01).

- [ ] **Step 4: FS-02 LOAD** → `Quoted Volume · {metrics.spanLabel}`, `<RampSplit on={metrics.onRamp} off={metrics.offRamp} />`, `Throughput {metrics.throughputRate}` (port from preview FS-02).

- [ ] **Step 5: FS-03** label `// CORRIDORS`; `metrics.corridors` rows reusing `pool-item` markup (port from preview FS-03).

- [ ] **Step 6: FS-04 QUEUE** — update `TransactionRow`: drop `stablePoint`/`stableLabel`/chain logic; show `{tx.source.country} → {tx.target.country}`, currency pair, the stablecoin symbol via `stablecoinLeg(tx)?.symbol ?? "FIAT"`, rail + relative age (`formatAge`), amount. Keep the existing render-prop `loading ? <PanelLoading/> : active ? ... : null` wrapper and `transactionListSize` slice.

- [ ] **Step 7: FS-05 TRACK** — keep the render-prop + `live.transactions.length > 0` guard; render route/amounts (existing ScrambleText), and stats `STABLE` (`stablecoinLeg`), `FX*` (`selected.exchangeRate`), `RAIL`, `STATUS`. Remove the FEE and RISK stats.

- [ ] **Step 8: FS-06/07/08** — inside each existing render-prop loading wrapper, render `<QuoteHealthCard metrics={metrics} />`, `<ThroughputCard metrics={metrics} />`, `<RailMixCard mix={metrics.railMix} />`. Update labels to `// HEALTH`, `// THROUGHPUT`, `// RAILS`.

- [ ] **Step 9: FocusTelemetry** — replace the `STABLECOIN`/`FIAT` chain logic with `stablecoinLeg(transaction)?.symbol ?? "FIAT"`; drop the `FX / FEE` item's fee half (show `FX*` only) or keep FX-only. Keep FLOW / STABLE / RAIL / AMOUNT.

- [ ] **Step 10: Verify** — `pnpm exec tsc --noEmit` clean (no new errors vs pre-existing baseline); `pnpm build`; `pnpm lint`. Then **manual visual** with `VITE_OWLPAY_SIMULATE=0` (real ~60 quotes): confirm all 8 panels show real data, stablecoin symbol appears in queue/track, on/off-ramp glow bar renders, throughput window label reflects the data span. State that the visual step is manual.

---

### Task 5: Slim `useLiveDashboard`

**Files:**
- Modify: `src/hooks/useLiveDashboard.ts`, `src/App.tsx`

- [ ] **Step 1: Reduce the hook** to return `{ transactions }` only. Keep the `useState` + `subscribe` (replace/append/update) plumbing exactly as-is. Delete the `useMemo` metric block and the `volume24h / volumeChange / medianSettlementSeconds / pools / railUptime / activeFlows` fields and the `LiveDashboard` / `PoolMetric` extra types (keep a minimal return type).

- [ ] **Step 2: Fix references in `App.tsx`** — every `live.<field>` other than `live.transactions` must now come from `metrics` (e.g. `live.railUptime` in FS-00 is gone — FS-00 already redesigned in Task 4; confirm no stragglers). Grep `live\.` in `App.tsx` and resolve each.

- [ ] **Step 3: Verify** — `pnpm exec tsc --noEmit` clean; `pnpm build`.

---

### Task 6: Simulator — default off + SIM badge

**Files:**
- Modify: `.env.local`, `src/App.tsx`

- [ ] **Step 1: Default off** — set `VITE_OWLPAY_SIMULATE=0` in `.env.local` (keep the explanatory comment). No change to `owlpaySimulator.ts` — synthetic txs clone a real adapted base, so their shape is already correct for the new panels.

- [ ] **Step 2: SIM badge** — in `MonitorApp`, when `import.meta.env.VITE_OWLPAY_SIMULATE === "1"`, render a small fixed-corner `SIM` chip (reuse an existing HUD label class) so simulated runs are unmistakable. Skip entirely when off.

- [ ] **Step 3: Verify** — `pnpm build`. Manual: with `=1` the chip shows and the queue trickles/surges; with `=0` it's absent and data is the real poll. State manual.

---

### Task 7: Repoint preview, keep as dev tool

**Files:**
- Modify: `src/preview/DashboardPreview.tsx` (already repointed in Task 1)

- [ ] **Step 1: Confirm** the preview imports `deriveMonitorMetrics`/`formatAge`/`stablecoinLeg` from `../services/transactions/monitorMetrics` and renders against `mockQuotes`. No fork of metric logic remains under `src/preview/`.

- [ ] **Step 2: Verify** — load `preview.html`; confirm it matches the live panels (same components/metrics, mock data). Visual.

---

### Task 8: Update the backend enrichment roadmap

**Files:**
- Modify: `docs/api-enrichment-roadmap.md`

- [ ] **Step 1: Add a "model has it, Resource omits it" table** listing: `blockchain`/`destination_blockchain` (ChainEnum → real chain mix, the true axis for FS-08), `exchange_rate` (replaces implied `FX*`), `fees_total_*`/`owlpay_fees_*` (real fee), `fiat_settlement_time_min/max/unit` (real settlement estimate), `provider`/`settlement_channel`, `quote_expire_date`. Note each is one-line to expose in `Application/V1/QuoteHistoryResource` + needs seeder population locally.

- [ ] **Step 2: Correct the record** — explicitly note that settlement-time IS available in the model (`fiat_settlement_time_*`), superseding the earlier "cannot compute settlement time" assumption; the live monitor uses pending-age only until the field is exposed.

- [ ] **Step 3: Verify** — doc renders; no code impact.

---

### Task 9: Final verification (no commit)

- [ ] **Step 1:** `pnpm exec tsc --noEmit` — no errors beyond the documented pre-existing baseline (`FuturisticPanel/`, `ThreeGlobeCanvas.tsx`, and the shared `*.css` TS2882 quirk). Compare against baseline before declaring clean.
- [ ] **Step 2:** `pnpm build` — succeeds.
- [ ] **Step 3:** `pnpm lint` — no new violations.
- [ ] **Step 4: Manual visual checklist** at live (`pnpm dev`, port 13845), `VITE_OWLPAY_SIMULATE=0`: 8 panels populated from real quotes; stablecoin symbol in queue + track; corridors populated; glow ramp correct; throughput window = data span; clicking a row enters focus with stablecoin in telemetry; globe routes still draw. State that this is manual and cannot be auto-verified.
- [ ] **Step 5: STOP.** Do not commit. Report completion + the manual-verification results and await the user's commit decision (count / repos / messages).

---

## Self-Review

- **Spec coverage:** every redesigned panel (FS-00…FS-08), the stablecoin restoration, adaptive window, glow bar, simulator default, preview reuse, and the backend roadmap are each owned by a task. ✓
- **No automated tests:** acknowledged up front; verification leans on tsc/build/lint + explicitly-flagged manual visual steps, consistent with the repo (CLAUDE.md). ✓
- **Type consistency:** `MonitorMetrics` field names (`quotedVolume`, `throughputRate`, `spanLabel`, `oldestPendingAgeSec`, `corridors`, `railMix`, `throughput`) are used identically across Tasks 1, 3, 4. `stablecoinLeg(tx)?.symbol` used identically in Tasks 4 and 9. ✓
- **Surgical:** adapter untouched; `useLiveDashboard` slimmed not rewritten; simulator unchanged except env default; no globe/boot changes. ✓
