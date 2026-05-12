# FlowSphere Monitor Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the FlowSphere dashboard from a three-column layout into a full-screen HUD monitor with dual visual modes (MAGI Monitor / NERV Alert).

**Architecture:** The globe canvas fills the viewport. All UI elements are absolutely-positioned HUD panels with semi-transparent backgrounds. The app has four interaction phases: monitor → focus → flight → success. CSS handles the MAGI↔NERV color transitions. Canvas 2D renders the flight tunnel animation.

**Tech Stack:** React 19, TypeScript, Vite (rolldown-vite), cobe (WebGL globe), JetBrains Mono (Google Fonts), pure CSS (no framework)

**Spec:** `docs/superpowers/specs/2026-05-12-monitor-redesign-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `index.html` | Modify | Add JetBrains Mono font link |
| `src/styles.css` | Rewrite | Full HUD layout, MAGI/NERV themes, all animations |
| `src/App.tsx` | Rewrite | HUD panel structure, 4-phase state machine, NERV overlay |
| `src/components/GlobeCanvas.tsx` | Modify | Focus-track rotation, arc dimming, NERV tunnel scene |
| `src/data/transactions.ts` | Unchanged | — |
| `src/hooks/useLiveDashboard.ts` | Unchanged | — |
| `src/lib/utils.ts` | Unchanged | — |
| `src/main.tsx` | Unchanged | — |
| `.gitignore` | Modify | Add `.superpowers/` |

---

### Task 1: Setup — Font Loading & Gitignore

**Files:**
- Modify: `index.html`
- Modify: `.gitignore`

- [ ] **Step 1: Add JetBrains Mono to index.html**

Add Google Fonts preconnect and stylesheet link in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700;800&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Add .superpowers/ to .gitignore**

Append `.superpowers/` to `.gitignore`.

- [ ] **Step 3: Verify font loads**

Run: `pnpm dev`

Open browser, inspect any element, confirm `JetBrains Mono` appears in the font-family list in DevTools.

- [ ] **Step 4: Commit**

```bash
git add index.html .gitignore
git commit -m "chore: add JetBrains Mono font and update gitignore"
```

---

### Task 2: CSS Rewrite — MAGI Monitor Theme

**Files:**
- Rewrite: `src/styles.css`

This task replaces the entire stylesheet with the new HUD layout. The CSS is split into logical sections described below. Write the complete file in one step.

- [ ] **Step 1: Write the new styles.css**

The file must contain these sections in order:

**Section 1 — Root & Reset:**
```css
:root {
  /* MAGI palette */
  --hud-cyan: #7df6ff;
  --hud-green: #4ade80;
  --hud-yellow: #f7ff4d;
  --hud-red: #ff4a3a;
  --hud-bg: #060a10;
  --panel-bg: rgba(4, 10, 18, 0.72);
  --panel-border: rgba(0, 200, 255, 0.14);
  --label-color: rgba(125, 246, 255, 0.45);
  --text-dim: rgba(125, 246, 255, 0.5);
  --text-bright: #e8fbff;

  font-family: 'JetBrains Mono', ui-monospace, monospace;
  color: var(--text-bright);
  background: var(--hud-bg);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; overflow: hidden; }
button { font: inherit; border: none; background: none; cursor: pointer; }
```

**Section 2 — App Shell (full viewport, hex grid, scan lines):**
- `.app-shell`: `position: relative; width: 100vw; height: 100vh; overflow: hidden; background: var(--hud-bg);`
- `.app-shell::before` (hex grid): fixed position, SVG background-image of hexagon pattern, opacity 0.025
- `.app-shell::after` (scan lines): fixed position, repeating-linear-gradient (1px solid / 3px gap), mix-blend-mode screen, opacity 0.02

**Section 3 — Globe Stage (full viewport canvas container):**
- `.globe-stage`: `position: absolute; inset: 0;` — the globe fills everything
- `.globe-canvas`: `position: absolute; inset: 0; cursor: grab; touch-action: none; user-select: none;`
- `.globe-canvas.is-dragging`: `cursor: grabbing;`
- `.globe-canvas canvas`: `position: absolute; inset: 0; width: 100% !important; height: 100% !important;`
- `.flight-layer`: `pointer-events: none;`

**Section 4 — HUD Panel base:**
```css
.hud-panel {
  position: absolute;
  z-index: 10;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  backdrop-filter: blur(12px);
  font-size: 12px;
  transition: opacity 500ms ease, transform 500ms cubic-bezier(0.2, 0.8, 0.2, 1),
              border-color 600ms ease, background 600ms ease;
}
.hud-panel::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(125, 246, 255, 0.3), transparent);
  transition: background 600ms ease;
}
.hud-label {
  font-size: 8px;
  color: var(--label-color);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: 6px;
  transition: color 600ms ease;
}
```

**Section 5 — Individual HUD panels (top-left system, top-right MAGI nodes, left metrics, left liquidity, right transactions, bottom detail, bottom-left coords):**

Each panel has a fixed position (top/left/right/bottom + pixel offsets). Key details:

- `.panel-system` (top-left): flex row, live dot + brand text, `top: 16px; left: 16px; padding: 10px 16px;`
- `.panel-magi` (top-right): flex row of 3 `.magi-node` boxes, `top: 16px; right: 16px; padding: 10px 14px;`
- `.panel-metrics` (left): `top: 70px; left: 16px; width: 150px; padding: 12px;` — contains metric items with large numeric values
- `.panel-liquidity` (left-bottom): `bottom: 80px; left: 16px; width: 150px; padding: 12px;` — pool bars with gradient fills
- `.panel-transactions` (right): `top: 70px; right: 16px; width: 220px; padding: 12px;` — transaction rows with status badges
- `.panel-detail` (bottom-center): `bottom: 16px; left: 50%; transform: translateX(-50%); width: min(600px, 72%); padding: 12px 20px;` — flex row: route info + stats + ENGAGE button
- `.panel-coords` (bottom-left): `bottom: 16px; left: 16px; padding: 8px 12px; font-size: 8px; color: rgba(125,246,255,0.3);`

**Section 6 — Component styles (live dot, metric values, pool bars, tx rows, status badges, engage button):**

- `.live-dot`: 7px green circle with box-shadow glow, pulse animation (2s ease infinite)
- `.metric-val`: font-size 18px, font-weight 700, text-shadow cyan glow
- `.metric-change`: font-size 9px, green color
- `.pool-bar-bg`: 3px height, rgba white background
- `.pool-bar-fill`: gradient green→cyan, box-shadow glow, width transition 650ms
- `.tx-item`: border 1px, padding 8px, transition border/background. `.tx-item.active`: left border 2px cyan, brighter bg
- `.status-badge`: inline, padding 1px 5px, font-size 7px, uppercase, border 1px solid currentColor. `.routing` cyan, `.pending` yellow, `.settled` green
- `.engage-btn`: padding 10px 20px, border 1px solid rgba(255,61,60,0.4), red-tinted background, color #ff6b6b, font-weight 700, letter-spacing 0.12em, uppercase. Sweep animation (linear gradient moving left→right, 2s infinite). Hover: brighter border, stronger glow.

**Section 7 — NERV Alert Mode (`.is-nerv` class on `.app-shell`):**

When `.app-shell.is-nerv`:
- Override CSS variables: `--panel-border: rgba(255,40,20,0.2); --panel-bg: rgba(10,4,6,0.8); --label-color: rgba(255,120,100,0.4); --text-dim: rgba(255,150,130,0.5);`
- `.app-shell.is-nerv::after` (scan lines): increase density to 1px/2px, add nervFlicker animation (step-end 0.1s)
- `.app-shell.is-nerv .hud-panel::before`: gradient shifts to red

**Section 8 — Flight/NERV overlay elements:**

- `.nerv-overlay`: `position: fixed; inset: 0; z-index: 30; pointer-events: none;` — container for all NERV-mode UI
- `.nerv-overlay.active`: `pointer-events: auto;`
- `.nerv-warn-bar`: repeating-linear-gradient chevron background, border-bottom 2px red, flex center, font-size 11px, font-weight 800, color #ff4a3a, letter-spacing 0.2em, warnBlink animation (1s step-end infinite)
- `.nerv-warn-bottom`: bottom bar with MAGI node status
- `.nerv-sender`, `.nerv-receiver`: positioned left/right at ~25% from top, width min(240px, 28vw), with slide-in animation (flightPanelIn 560ms cubic-bezier)
- `.nerv-entity`: font-size 16px, font-weight 700, color #ffcec8
- `.nerv-amount`: font-size 20px, font-weight 800, color #ff6b5a, text-shadow red glow
- `.nerv-stages`: flex row, absolute top under warning bar, centered
- `.nerv-stage`: padding 5px 8px, border red-tinted, font-size 8px. `.nerv-stage.active`: brighter, border-color red, box-shadow
- `.jp-deco`: position absolute, writing-mode vertical-rl, color rgba(255,60,40,0.12), font-size 11px, letter-spacing 0.3em
- `.cancel-nerv`: top-right button, red border, dark bg

**Section 9 — Phase transitions:**

When `.is-flying` is on `.app-shell`:
- `.panel-system`: `opacity: 0; transform: translateY(-120%);`
- `.panel-magi`: `opacity: 0; transform: translateY(-120%);`
- `.panel-metrics`: `opacity: 0; transform: translateX(-120%);`
- `.panel-liquidity`: `opacity: 0; transform: translateX(-120%);`
- `.panel-transactions`: `opacity: 0; transform: translateX(120%);`
- `.panel-detail`: `opacity: 0; transform: translateY(130%);`
- `.panel-coords`: `opacity: 0; transform: translateY(130%);`

**Section 10 — Globe overlay elements (live badge, cobe labels, globe caption):**

Carry over from current styles: `.live-badge`, `.cobe-label`, `.city-label`, `.flow-label` with updated colors to match MAGI theme. Position `.live-badge` at top: 18px, left: 18px (but z-index below HUD panels). `.globe-caption`: hidden (replaced by bottom detail bar).

**Section 11 — Keyframe animations:**

```css
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes engageSweep { from { left: -100%; } to { left: 100%; } }
@keyframes warnBlink { 0%, 70% { opacity: 1; } 71%, 100% { opacity: 0.3; } }
@keyframes nervFlicker { 0% { opacity: 0.7; } 100% { opacity: 1; } }
@keyframes flightPanelIn { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes sparklineShift { from { background-position: 0 0, 0 0; } to { background-position: -180% 0, 0 0; } }
```

**Section 12 — Responsive breakpoints:**

```css
@media (max-width: 1120px) {
  .panel-transactions { top: auto; bottom: 70px; right: 16px; max-height: 40vh; overflow-y: auto; }
  .panel-metrics { width: 130px; }
  .panel-liquidity { width: 130px; }
}

@media (max-width: 720px) {
  .panel-metrics, .panel-liquidity { display: none; }
  .panel-magi { display: none; }
  .panel-transactions { left: 16px; right: 16px; width: auto; bottom: 70px; max-height: 35vh; }
  .panel-detail { width: calc(100% - 32px); flex-wrap: wrap; }
  .nerv-sender, .nerv-receiver { width: calc(100% - 32px); left: 16px; right: auto; }
  .nerv-receiver { top: auto; bottom: 80px; }
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm dev`

At this point the app will be broken (App.tsx still uses old class names). That's expected — confirm that the dev server starts and the CSS file loads without syntax errors by checking the browser console.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: rewrite CSS for full-screen HUD layout with MAGI/NERV themes"
```

---

### Task 3: App.tsx Rewrite — HUD Layout & State Machine

**Files:**
- Rewrite: `src/App.tsx`

- [ ] **Step 1: Write the new App.tsx**

The component structure changes from grid layout to absolute-positioned HUD panels. Key changes:

**Imports** — same as current, plus add `Globe2` is already imported. No new dependencies.

**Mode type** — expand to 4 phases:
```tsx
type Mode = "monitor" | "focus" | "flight" | "success"
```

**Stages array** — same as current (5 stages with icons).

**Constants:**
```tsx
const FLIGHT_DURATION = 6400
```

**Metric component** — simplify for HUD style:
```tsx
function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="metric-item">
      <div className="hud-label">{label}</div>
      <div className="metric-val" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  )
}
```

**TransactionRow** — redesigned for HUD transaction list:
```tsx
function TransactionRow({
  transaction,
  active,
  onClick,
}: {
  transaction: Transaction
  active: boolean
  onClick: () => void
}) {
  return (
    <button className={cn("tx-item", active && "active")} onClick={onClick}>
      <div>
        <span className="tx-id">{transaction.id}</span>
        <span className={cn("status-badge", transaction.status)}>{transaction.status}</span>
      </div>
      <div className="tx-route-text">
        {transaction.source.city} → {transaction.target.city} · {formatCompactMoney(Math.max(transaction.source.amount, transaction.target.amount))}
      </div>
    </button>
  )
}
```

**NervOverlay** — replaces FlightOverlay, new NERV alert mode UI:
```tsx
function NervOverlay({
  selected,
  mode,
  flightStartedAt,
  onCancel,
}: {
  selected: Transaction
  mode: Mode
  flightStartedAt: number | null
  onCancel: () => void
}) {
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (mode !== "flight" && mode !== "success") return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  const elapsed = flightStartedAt ? now - flightStartedAt : 0
  const progress = Math.min(elapsed / FLIGHT_DURATION, 1)
  const visibleStages = Math.max(1, Math.ceil(progress * stages.length))

  if (mode !== "flight" && mode !== "success") return null

  return (
    <div className="nerv-overlay active">
      {/* Warning top bar */}
      <div className="nerv-warn-bar">⚠ SETTLEMENT TRACKING ACTIVE ⚠</div>

      {/* Cancel button */}
      <button className="cancel-nerv" onClick={onCancel} type="button">
        <X size={14} />
        <span>ABORT</span>
      </button>

      {/* Stage strip */}
      <div className="nerv-stages">
        {stages.map((stage, index) => {
          const Icon = stage.icon
          return (
            <div key={stage.label} className={cn("nerv-stage", index < visibleStages && "active")}>
              <Icon size={12} />
              <span>{stage.label}</span>
            </div>
          )
        })}
      </div>

      {/* Sender panel */}
      <div className="nerv-sender">
        <div className="nerv-panel-label">Sender Validation</div>
        <div className="nerv-entity">{selected.source.name}</div>
        <div className="nerv-loc">{selected.source.city}, {selected.source.country}</div>
        <div className="nerv-amount">{formatMoney(selected.source.amount, selected.source.currency)}</div>
        <div className="nerv-tags">
          <span className="nerv-tag">{selected.source.currency}</span>
          <span className="nerv-tag">{selected.rail}</span>
        </div>
      </div>

      {/* Receiver panel */}
      <div className="nerv-receiver">
        <div className="nerv-panel-label">Receiver Settlement</div>
        <div className="nerv-entity">{selected.target.name}</div>
        <div className="nerv-loc">{selected.target.city}, {selected.target.country}</div>
        <div className="nerv-amount">{formatMoney(selected.target.amount, selected.target.currency)}</div>
        <div className="nerv-tags">
          <span className="nerv-tag">{selected.target.chain ?? "BANK"}</span>
          <span className="nerv-tag">{selected.liquidityPool}</span>
        </div>
      </div>

      {/* Japanese decorative text */}
      <div className="jp-deco jp-left">緊急送金追跡中</div>
      <div className="jp-deco jp-right">決済確認待機</div>

      {/* Bottom MAGI status */}
      <div className="nerv-warn-bottom">
        <span>CASPER: {progress > 0.3 ? "CONFIRMED" : "PROCESSING"}</span>
        <span>MELCHIOR: {progress > 0.6 ? "CONFIRMED" : "PROCESSING"}</span>
        <span>BALTHASAR: {progress > 0.9 ? "CONFIRMED" : "PROCESSING"}</span>
      </div>

      {/* Settlement confirmed text (success mode) */}
      {mode === "success" && (
        <div className="nerv-confirmed">
          <div className="nerv-confirmed-text">SETTLEMENT CONFIRMED</div>
          <div className="nerv-confirmed-jp">決済完了</div>
        </div>
      )}
    </div>
  )
}
```

**App component** — full rewrite of the main layout:

```tsx
export function App() {
  const live = useLiveDashboard()
  const [selectedId, setSelectedId] = useState(baseTransactions[0].id)
  const [mode, setMode] = useState<Mode>("monitor")
  const [flightStartedAt, setFlightStartedAt] = useState<number | null>(null)
  const resetTimerRef = useRef<number | null>(null)

  const selected = useMemo(
    () => live.transactions.find((tx) => tx.id === selectedId) ?? live.transactions[0],
    [live.transactions, selectedId],
  )

  // Focus track: click a transaction row
  const focusTransaction = (tx: Transaction) => {
    if (mode === "flight" || mode === "success") return
    setSelectedId(tx.id)
    setMode("focus")
  }

  // Engage: start NERV flight
  const engage = () => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setMode("flight")
    setFlightStartedAt(performance.now())
  }

  const finishFlight = useCallback(() => {
    setMode("success")
    resetTimerRef.current = window.setTimeout(() => {
      setMode("monitor")
      setFlightStartedAt(null)
      resetTimerRef.current = null
    }, 1500)
  }, [])

  const cancelFlight = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
    setMode("monitor")
    setFlightStartedAt(null)
  }, [])

  const isFlying = mode === "flight" || mode === "success"

  return (
    <main className={cn("app-shell", isFlying && "is-flying", isFlying && "is-nerv")}>
      {/* Globe fills entire viewport */}
      <div className="globe-stage">
        <GlobeCanvas
          transactions={live.transactions}
          selected={selected}
          mode={mode}
          flightStartedAt={flightStartedAt}
          onFlightDone={finishFlight}
        />
      </div>

      {/* HUD: Top-left system status */}
      <div className="hud-panel panel-system">
        <div className="live-dot" />
        <div className="system-text">
          <strong>FLOWSPHERE</strong> · Global rails online · {live.railUptime.toFixed(2)}%
        </div>
      </div>

      {/* HUD: Top-right MAGI nodes */}
      <div className="hud-panel panel-magi">
        {["CASPER", "MELCHIOR", "BALTHASAR"].map((name) => (
          <div className="magi-node" key={name}>
            <span className="magi-name">{name}</span>
            <span className="magi-status">OK</span>
          </div>
        ))}
      </div>

      {/* HUD: Left metrics */}
      <div className="hud-panel panel-metrics">
        <div className="hud-label">Network Load</div>
        <div className="metric-item">
          <div className="metric-val">{formatCompactMoney(live.volume24h)}</div>
          <div className="metric-change">{live.volumeChange >= 0 ? "+" : ""}{live.volumeChange.toFixed(1)}% ▲</div>
        </div>
        <Metric label="Settlement" value={formatEta(live.medianSettlementSeconds)} />
        <Metric label="Active Flows" value={live.activeFlows.toString()} accent="var(--hud-green)" />
      </div>

      {/* HUD: Left-bottom liquidity */}
      <div className="hud-panel panel-liquidity">
        <div className="hud-label">Liquidity Pools</div>
        {live.pools.map((pool) => (
          <div className="pool-item" key={pool.name}>
            <div className="pool-name">
              <span>{pool.name}</span>
              <span>{pool.utilization}%</span>
            </div>
            <div className="pool-bar-bg">
              <div className="pool-bar-fill" style={{ width: `${pool.utilization}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* HUD: Right transaction queue */}
      <div className="hud-panel panel-transactions">
        <div className="hud-label">Transaction Queue</div>
        {live.transactions.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            active={tx.id === selected.id}
            onClick={() => focusTransaction(tx)}
          />
        ))}
      </div>

      {/* HUD: Bottom detail bar */}
      <div className="hud-panel panel-detail">
        <div className="detail-route">
          <div className="detail-from-to">
            <span>{selected.source.city}</span>
            <ArrowRight size={14} />
            <span>{selected.target.city}</span>
          </div>
          <div className="detail-amounts">
            <span>{formatMoney(selected.source.amount, selected.source.currency)}</span>
            <span className="detail-arrow">→</span>
            <span>{formatMoney(selected.target.amount, selected.target.currency)}</span>
          </div>
        </div>
        <div className="detail-stats">
          <div className="detail-stat">
            <span className="ds-label">FX</span>
            <span className="ds-val">{selected.exchangeRate}</span>
          </div>
          <div className="detail-stat">
            <span className="ds-label">FEE</span>
            <span className="ds-val">{formatMoney(selected.fee, "USD")}</span>
          </div>
          <div className="detail-stat">
            <span className="ds-label">RAIL</span>
            <span className="ds-val">{selected.rail}</span>
          </div>
          <div className="detail-stat">
            <span className="ds-label">RISK</span>
            <span className="ds-val" style={{ color: selected.riskScore < 30 ? "var(--hud-green)" : "var(--hud-yellow)" }}>{selected.riskScore}</span>
          </div>
        </div>
        {mode === "focus" && (
          <button className="engage-btn" onClick={engage}>▶ ENGAGE</button>
        )}
      </div>

      {/* HUD: Bottom-left coords */}
      <div className="hud-panel panel-coords">
        PHI 0.224 · θ 0.220 · {selected.source.city.toUpperCase().slice(0, 3)} → {selected.target.city.toUpperCase().slice(0, 3)}
      </div>

      {/* NERV Alert Overlay */}
      <NervOverlay
        selected={selected}
        mode={mode}
        flightStartedAt={flightStartedAt}
        onCancel={cancelFlight}
      />
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser**

Run: `pnpm dev`

The page should show the globe filling the viewport with HUD panels overlaid. Click a transaction → bottom bar updates, ENGAGE button appears. Click ENGAGE → HUD slides out, NERV overlay appears (canvas flight animation may still look like old style — that's Task 4).

Verify:
- Globe renders and rotates
- All 5 HUD panels visible
- Transaction click → focus mode → ENGAGE button shows
- ENGAGE → panels slide out, NERV overlay appears
- Cancel returns to monitor mode
- Settlement confirmed text shows after flight completes

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: rewrite App layout as full-screen HUD with 4-phase state machine"
```

---

### Task 4: GlobeCanvas — Focus Track & NERV Tunnel

**Files:**
- Modify: `src/components/GlobeCanvas.tsx`

- [ ] **Step 1: Add focus-track rotation**

In the `GlobeCanvasProps` type, `mode` already includes the new `"focus"` value via the shared type. The globe needs to smoothly rotate toward the selected transaction's midpoint when in focus mode.

Inside the `animate` function (the rAF loop), replace the phi auto-rotation logic. Currently:

```typescript
if (!drag.active) {
  phiRef.current += current.mode === "monitor" ? 0.0045 + drag.velocity : 0.0012
  drag.velocity *= 0.94
  if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
}
```

Replace with focus-aware rotation:

```typescript
if (!drag.active) {
  if (current.mode === "focus") {
    // Smoothly rotate to center the selected transaction's route midpoint
    const midLng = (current.selected.source.lng + current.selected.target.lng) / 2
    const targetPhi = -midLng * (Math.PI / 180) + Math.PI
    let delta = targetPhi - phiRef.current
    // Normalize to [-PI, PI]
    delta = ((delta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    phiRef.current += delta * 0.04
  } else if (current.mode === "monitor") {
    phiRef.current += 0.0045 + drag.velocity
  } else {
    phiRef.current += 0.0012
  }
  drag.velocity *= 0.94
  if (Math.abs(drag.velocity) < 0.0001) drag.velocity = 0
}
```

- [ ] **Step 2: Add arc dimming in focus mode**

In the `animate` function, where `alpha` is calculated for each transaction's arc, modify the alpha based on whether this transaction is the selected one during focus mode:

Find this line:
```typescript
const alpha = selectedTx ? 1 : fadeIn * fadeOut
```

Replace with:
```typescript
const dimmed = current.mode === "focus" && !selectedTx
const alpha = selectedTx ? 1 : dimmed ? fadeIn * fadeOut * 0.2 : fadeIn * fadeOut
```

- [ ] **Step 3: Update flight scene for NERV tunnel aesthetic**

Replace the `drawFlightScene` function body. The new version renders concentric rings converging to a center point with red color palette instead of the current green/cyan warp:

```typescript
function drawFlightScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  progress: number,
  success: number,
  selected: Transaction,
) {
  const cx = w * 0.5
  const cy = h * 0.46
  const speed = now * 0.002

  // Dark red background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
  bg.addColorStop(0, "rgba(255, 40, 30, 0.12)")
  bg.addColorStop(0.4, "rgba(10, 4, 6, 0.95)")
  bg.addColorStop(1, "rgba(6, 2, 3, 1)")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.globalCompositeOperation = "lighter"

  // Converging tunnel rings
  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const phase = ((speed * 0.5 + i / ringCount + progress * 2) % 1)
    const radius = (1 - phase) * Math.max(w, h) * 0.45
    if (radius < 5) continue
    const alpha = phase * 0.4 * (1 - phase)
    ctx.strokeStyle = `rgba(255, 60, 40, ${alpha})`
    ctx.lineWidth = 1 + phase * 3
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Warp streaks (radial lines converging inward)
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2
    const phase = (speed + i * 0.09 + progress * 3) % 1
    const innerR = 20 + phase * 60
    const outerR = innerR + 40 + (1 - phase) * 200
    const alpha = (1 - phase) * 0.3
    ctx.strokeStyle = i % 4 === 0
      ? `rgba(255, 80, 60, ${alpha})`
      : `rgba(255, 180, 160, ${alpha * 0.5})`
    ctx.lineWidth = 1 + (1 - phase) * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR)
    ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR)
    ctx.stroke()
  }

  // Center convergence glow
  const arrival = Math.max(0, (progress - 0.7) / 0.3)
  const glowR = 20 + arrival * 80 + success * 120

  if (success > 0) {
    // Green success burst
    drawGlow(ctx, cx, cy, glowR, `rgba(74, 222, 128, ${0.4 + success * 0.5})`)
  } else {
    // Red convergence
    drawGlow(ctx, cx, cy, glowR, `rgba(255, 60, 40, ${0.2 + arrival * 0.5})`)
  }

  // Center dot
  ctx.fillStyle = success > 0
    ? `rgba(74, 222, 128, ${0.8 + success * 0.2})`
    : `rgba(255, 60, 40, ${0.5 + arrival * 0.5})`
  ctx.beginPath()
  ctx.arc(cx, cy, 4 + arrival * 8 + success * 12, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()

  // Target city text
  ctx.fillStyle = `rgba(255, 206, 200, ${0.7 + arrival * 0.3})`
  ctx.font = "800 14px 'JetBrains Mono', monospace"
  ctx.textAlign = "center"
  ctx.fillText(selected.target.city.toUpperCase(), cx, cy - 50 - arrival * 20)

  // Progress text
  ctx.fillStyle = "rgba(255, 150, 130, 0.5)"
  ctx.font = "500 11px 'JetBrains Mono', monospace"
  ctx.fillText(`${Math.round(progress * 100)}% ROUTE TRAVERSED`, cx, h - 50)

  // Success text
  if (success > 0) {
    ctx.fillStyle = `rgba(74, 222, 128, ${success})`
    ctx.font = "800 28px 'JetBrains Mono', monospace"
    ctx.fillText("SETTLEMENT CONFIRMED", cx, cy + 80)
    ctx.fillStyle = `rgba(74, 222, 128, ${success * 0.7})`
    ctx.font = "700 18px 'JetBrains Mono', monospace"
    ctx.fillText("決済完了", cx, cy + 110)
  }
}
```

- [ ] **Step 4: Update globe styling for NERV mode**

In the `globe.update()` call inside the animate function, update the appearance when in flight/success mode:

Find:
```typescript
globe.update({
  phi: phiRef.current,
  theta: current.mode === "monitor" ? 0.22 : 0.34,
  scale: current.mode === "monitor" ? 1 : 1.12,
```

Replace with:
```typescript
const isFlying = current.mode === "flight" || current.mode === "success"
globe.update({
  phi: phiRef.current,
  theta: current.mode === "monitor" || current.mode === "focus" ? 0.22 : 0.34,
  scale: current.mode === "focus" ? 1.05 : isFlying ? 1.12 : 1,
```

Also update the arcWidth/arcHeight lines:
```typescript
  arcWidth: isFlying ? 1.35 : current.mode === "focus" ? 1.4 : 1.22,
  arcHeight: isFlying ? 0.52 : current.mode === "focus" ? 0.42 : 0.34,
```

- [ ] **Step 5: Update flight canvas opacity for NERV mode**

In the flight canvas render function, find where it checks `rawFlight > 0.08`:

```typescript
if (currentMode !== "monitor" && rawFlight > 0.08) {
```

Update to also exclude focus mode:

```typescript
if ((currentMode === "flight" || currentMode === "success") && rawFlight > 0.08) {
```

- [ ] **Step 6: Verify full interaction flow in browser**

Run: `pnpm dev`

Test the complete flow:
1. Monitor mode: globe rotates, HUD panels visible, arcs animate
2. Click a transaction → globe rotates to that route, other arcs dim, ENGAGE appears
3. Click ENGAGE → HUD slides out, red NERV mode activates, tunnel animation plays
4. After 6.4s → "SETTLEMENT CONFIRMED / 決済完了" in green
5. After 1.5s → smoothly returns to MAGI monitor mode
6. Cancel button during flight returns to monitor

- [ ] **Step 7: Commit**

```bash
git add src/components/GlobeCanvas.tsx
git commit -m "feat: add focus-track rotation, arc dimming, and NERV tunnel animation"
```

---

### Task 5: Polish & Visual Refinement

**Files:**
- Modify: `src/styles.css` (minor tweaks)
- Modify: `src/App.tsx` (minor tweaks)

- [ ] **Step 1: Add NERV confirmed overlay styles**

Add to `src/styles.css`:

```css
.nerv-confirmed {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  z-index: 5;
  animation: flightPanelIn 400ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.nerv-confirmed-text {
  font-size: clamp(20px, 3.5vw, 36px);
  font-weight: 800;
  color: #4ade80;
  text-shadow: 0 0 40px rgba(74, 222, 128, 0.5);
  letter-spacing: 0.1em;
}

.nerv-confirmed-jp {
  font-size: clamp(14px, 2vw, 22px);
  font-weight: 700;
  color: rgba(74, 222, 128, 0.7);
  margin-top: 8px;
}

.nerv-tags {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.nerv-tag {
  padding: 2px 8px;
  border: 1px solid rgba(255, 60, 40, 0.25);
  font-size: 8px;
  color: rgba(255, 150, 130, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.nerv-panel-label {
  font-size: 7px;
  color: rgba(255, 120, 100, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-bottom: 8px;
}

.nerv-entity {
  font-size: 16px;
  font-weight: 700;
  color: #ffcec8;
  margin-bottom: 4px;
}

.nerv-loc {
  font-size: 9px;
  color: rgba(255, 150, 130, 0.5);
}

.nerv-amount {
  font-size: 20px;
  font-weight: 800;
  color: #ff6b5a;
  text-shadow: 0 0 15px rgba(255, 60, 40, 0.3);
  margin-top: 10px;
}
```

- [ ] **Step 2: Full visual QA in browser**

Run: `pnpm dev`

Check every state:
- Monitor mode: all panels positioned correctly, no overlap, readable text
- Focus mode: ENGAGE button visible, globe rotation smooth
- Flight mode: NERV overlay looks right, animations smooth, Japanese text visible
- Success mode: green confirmed text centered
- Responsive: resize to 720px — panels adapt, nothing overflows

- [ ] **Step 3: Commit**

```bash
git add src/styles.css src/App.tsx
git commit -m "feat: add NERV overlay styles and visual polish"
```

---

### Task 6: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
pnpm build
```

Verify: no TypeScript errors, no build warnings, output in `dist/`.

- [ ] **Step 2: Preview production build**

```bash
pnpm preview
```

Open in browser, test the full flow (monitor → focus → flight → success → monitor). Confirm fonts load, animations work, no console errors.

- [ ] **Step 3: Final commit if any fixes were needed**

If any fixes were made during QA, commit them:

```bash
git add -A
git commit -m "fix: address build and QA issues"
```
