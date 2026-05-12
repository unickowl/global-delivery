# FlowSphere Monitor Redesign — Design Spec

## Overview

Redesign the FlowSphere stablecoin flow dashboard from a three-column panel layout into a full-screen HUD (heads-up display) monitor with the 3D globe as the dominant visual. The design has two distinct visual modes: **MAGI Monitor** (calm, data-rich surveillance) and **NERV Alert** (high-tension flight tracking). Inspired by modern cyberpunk aesthetics and Neon Genesis Evangelion's command center interfaces.

## Visual Identity

### MAGI Monitor Mode (Default)

- **Background**: Deep navy-black (#060a10) with subtle hexagonal grid pattern (opacity ~0.025) and faint scan lines (screen blend, ~0.015 opacity)
- **Primary color**: Cold cyan (#7df6ff) for text, borders, glows
- **Accent colors**: Green (#4ade80) for positive indicators, yellow (#f7ff4d) for pending states
- **Panels**: Semi-transparent (rgba ~0.72 alpha) with backdrop-filter blur(12px), thin cyan borders (opacity ~0.14), top-edge gradient glow
- **Typography**: JetBrains Mono (monospace) for all HUD data. All-caps labels with wide letter-spacing (0.12–0.15em). Tabular-nums for numeric displays.
- **Atmosphere**: Holographic projection feel — panels float over the globe like transparent glass overlays

### NERV Alert Mode (Flight Tracking)

- **Background**: Dark crimson-black (#0a0406) with red-tinted radial gradients
- **Primary color**: Alert red (#ff4a3a) replacing all cyan elements
- **Scan lines**: Increased density (1px/3px repeat vs 1px/4px), with CRT flicker animation (step-end, 0.1s)
- **Warning elements**: Chevron-striped warning bars (top/bottom), blinking animation (1s step-end cycle)
- **Japanese decorative text**: Vertical writing mode (writing-mode: vertical-rl), low opacity (~0.12), positioned along left/right edges. Examples: 「緊急送金追跡中」「決済確認待機」
- **Transition**: All color properties animate over ~600ms when switching modes. Background, border colors, text colors, and glows all shift from cyan→red palette.

## Layout Architecture

### Full-Screen HUD (MAGI Mode)

The entire viewport is the globe canvas. All UI elements are absolutely-positioned HUD panels floating on top.

```
┌──────────────────────────────────────────────────┐
│ [SYSTEM STATUS]              [MAGI: C / M / B]   │
│                                                    │
│ [NETWORK LOAD]          ╭─────────╮   [TX QUEUE]  │
│  $4.2M                  │         │    TX-8F31 ●   │
│  +24.3%                 │  GLOBE  │    TX-1C72 ●   │
│                         │  (cobe) │    TX-6B09 ●   │
│ [SETTLEMENT]            │         │    TX-4A91 ●   │
│  00:58                  ╰─────────╯    TX-9E64 ●   │
│                                                    │
│ [LIQUIDITY POOLS]                                  │
│  APAC ██████░░ 78%                                 │
│  EU   █████░░░ 65%                                 │
│                                                    │
│ [COORDS]   [ SELECTED FLOW DETAIL   ▶ ENGAGE ]    │
└──────────────────────────────────────────────────┘
```

**Panel positions:**
- **Top-left**: System status — brand mark, "FLOWSPHERE", live indicator dot, "GLOBAL RAILS ONLINE"
- **Top-right**: MAGI nodes — three sub-boxes labeled CASPER / MELCHIOR / BALTHASAR with OK/WARN status
- **Left column** (stacked): Network Load panel (volume, % change, settlement time, active flows) + Liquidity Pools panel (4 pool bars)
- **Right column**: Transaction Queue — scrollable list of 5 transactions, each showing ID, status badge, route, amount
- **Bottom-center**: Selected Flow Detail bar — route (city→city), amounts, FX rate, fee, rail, risk score, and the red ENGAGE button
- **Bottom-left**: Coordinate readout (phi, theta, lat, lng) in small monospace text

### NERV Alert Mode (Full-Screen Flight)

When ENGAGE is pressed, the entire screen transitions:

```
┌──────────────────────────────────────────────────┐
│ ⚠⚠⚠ SETTLEMENT TRACKING ACTIVE ⚠⚠⚠              │
│                                                    │
│ [STAGES: ● Quote ● Liquidity ● Rail ○ KYT ○ Fin] │
│                                                    │
│  ┌─SENDER──────┐    ╭──╮╭──╮╭╮    ┌─RECEIVER────┐│
│  │ Meridian     │    │  ││  │││    │ Atlas Exch   ││
│  │ Treasury     │    │  ╰╯  │╰╯   │              ││
│  │ SF, US       │    ╰──────╯     │ Singapore    ││
│  │ $420,000     │    SINGAPORE     │ 419,202 USDC ││
│  └──────────────┘    62% TRAVERSED └──────────────┘│
│                                                    │
│  緊急送金追跡中              決済確認待機           │
│                                                    │
│  CASPER: OK  MELCHIOR: OK  BALTHASAR: PROCESSING   │
└──────────────────────────────────────────────────┘
```

**Elements:**
- Warning bar (top): repeating chevron background, blinking "SETTLEMENT TRACKING ACTIVE"
- Stage strip (below warning): 5 stages with dot indicators, active stages highlighted
- Sender panel (left): entity name, location, amount, currency/rail tags
- Receiver panel (right): entity name, location, amount, chain/pool tags
- Center: Concentric circle tunnel animation (4 rings converging to center point), target city label, route progress percentage
- Japanese vertical text: decorative, low opacity, left and right edges
- Bottom status bar: MAGI node confirmation status (CASPER/MELCHIOR/BALTHASAR)
- Canvas layer: Tunnel/warp animation rendered via Canvas 2D (replaces the current flight scene)

## Interaction Model

### Phase 1: MAGI Monitor (Default)

- Globe auto-rotates (phi += 0.0045/frame)
- User can drag to rotate (pointer capture, inertia decay)
- Transaction arcs animate continuously on the globe (segmented particles)
- All HUD panels display live-updating data (700ms tick interval)
- Clicking a transaction in the queue → Phase 2

### Phase 2: Focus Track

Triggered by clicking a transaction row in the queue:

1. Globe smoothly rotates to center the selected route (animate phi over ~800ms with easing)
2. Selected transaction's arc brightens and thickens; other arcs dim to ~0.3 opacity
3. Bottom detail bar updates with selected transaction info
4. Transaction row gets active highlight (left border accent)
5. Red ENGAGE button appears/pulses in the bottom detail bar
6. User can click another transaction to re-focus, or click ENGAGE → Phase 3

### Phase 3: NERV Alert Flight

Triggered by clicking ENGAGE:

1. **Transition out** (~500ms): HUD panels slide/fade out (topbar↑, left←, right→, bottom↓)
2. **Color shift** (~600ms): Background, borders, scan lines all transition from cyan palette to red palette
3. **Globe fades**: cobe canvas opacity → 0 over 400ms
4. **Flight canvas activates**: Tunnel/warp animation begins on the overlay canvas
5. **NERV UI appears**: Warning bars, sender/receiver panels, stage strip animate in
6. **Progress**: 5 stages light up sequentially over FLIGHT_DURATION (6400ms)
7. **Cancel button**: Top-right, allows returning to MAGI mode at any time
8. At 100% → Phase 4

### Phase 4: Settlement Confirmed

1. Center convergence point bursts with green glow (#4ade80)
2. Text: "SETTLEMENT CONFIRMED / 決済完了" in large bold text
3. Hold for 1.5 seconds
4. **Reverse transition** (~800ms): Red palette → cyan palette, NERV panels fade out, globe fades back in, HUD panels slide back in
5. Return to Phase 1 (MAGI Monitor)

## Component Architecture

### Files to modify

- **`src/styles.css`** — Complete rewrite. New HUD layout, MAGI/NERV dual-theme, animations.
- **`src/App.tsx`** — Restructure layout from grid panels to absolute-positioned HUD. Add Focus Track phase logic. Restructure FlightOverlay for NERV mode.
- **`src/components/GlobeCanvas.tsx`** — Add focus-track rotation animation (smooth phi targeting). Adjust arc dimming when a transaction is focused. Update flight scene rendering for NERV tunnel aesthetic.

### Files unchanged

- **`src/data/transactions.ts`** — Same data model
- **`src/hooks/useLiveDashboard.ts`** — Same live simulation logic
- **`src/lib/utils.ts`** — Same utility functions
- **`src/main.tsx`** — Same entry point

### New state: Focus Track

The current `Mode` type expands from `"monitor" | "flight" | "success"` to `"monitor" | "focus" | "flight" | "success"`.

- `"focus"`: Transaction is selected, globe is rotating to target, ENGAGE button visible
- Transition: `monitor` → `focus` (click tx) → `flight` (click ENGAGE) → `success` (animation done) → `monitor` (auto after 1.5s)

## Font Loading

Add JetBrains Mono via Google Fonts or self-host. It replaces Inter as the primary UI font for all HUD elements. Inter may remain as a fallback but is not actively used.

## Responsive Behavior

The HUD layout naturally adapts since panels are absolutely positioned:
- **< 1120px**: Transaction queue moves to bottom overlay (slide-up drawer), left metrics stack horizontally
- **< 720px**: Simplify to essential HUD only (system status, 2 key metrics, transaction list as bottom sheet). NERV mode remains full-screen.

## Out of Scope

- No backend or real API integration
- No new data fields or transaction types
- No changes to the cobe globe rendering engine itself
- No authentication or routing
