# OwlPay Globe — Live Transaction Monitor

A 24/7 control-room dashboard for OwlPay on-ramp / off-ramp (fiat ↔ stablecoin)
flows, visualized as live arcs on an interactive Three.js globe with a
cyberpunk HUD. Built for high-resolution wall displays as well as desktop.

**Stack:** React 18 + TypeScript · **rolldown-vite** (not vanilla Vite) · **pnpm** · Three.js (custom WebGL render path).

---

## Quick start

```bash
pnpm install
cp .env.example .env.local      # defaults to "mock" — runs with no backend or auth
pnpm dev                        # http://localhost:5173  (binds 0.0.0.0)
```

The default `mock` source produces synthetic in-browser data, so a fresh clone
runs offline with nothing else set up. Point it at the real API only when you
need live data (see below).

---

## Data sources

`VITE_TRANSACTION_SOURCE` selects where transactions come from:

| Value | Behavior | Needs |
| --- | --- | --- |
| `mock` (default) | Synthetic in-browser stream | nothing |
| `owlpay` | Polls real `GET /api/v1/quotes` every 10s; **UI is gated behind Harbor SSO** | the 3 owlpay vars below |

In `owlpay` mode the app shows the Harbor login gate until the auth cookie is
present (it redirects to `${VITE_API_HARBOR_URL}/api/v1/auth/internal/login`).

## Environment

All vars are build-time — **restart `pnpm dev` after changing them**. See
[`.env.example`](./.env.example) for the annotated template.

| Variable | When needed | Description |
| --- | --- | --- |
| `VITE_TRANSACTION_SOURCE` | always | `mock` or `owlpay` |
| `VITE_BANK_MODULE_API_ENDPOINT` | owlpay | Base URL polled at `/api/v1/quotes` |
| `VITE_API_HARBOR_URL` | owlpay | Harbor SSO base URL (login redirect) |
| `VITE_AUTH_COOKIE_NAME` | owlpay | Same-domain auth cookie the gate looks for |
| `VITE_OWLPAY_SIMULATE` | optional/dev | `true` evolves a static snapshot in-browser to demo the polling UX |

`.env.local` is gitignored (`*.local`); never commit real endpoints/cookies.

---

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (HMR, binds `0.0.0.0`) |
| `pnpm build` | Production build (does **not** typecheck) |
| `pnpm preview` | Serve the built bundle |
| `pnpm lint` | oxlint over `src/` |
| `pnpm test` / `pnpm test:run` | Vitest (watch / once) |
| `pnpm exec tsc --noEmit` | Typecheck (no script; run directly) |

> **Tests are configured** (Vitest + Testing Library). Run `pnpm test:run`
> before pushing non-trivial changes; run `tsc --noEmit` when types matter
> (`build` does not typecheck). A few **pre-existing** tsc errors live in
> `FuturisticPanel/` and `ThreeGlobeCanvas.tsx` — don't add to that count.

---

## How it works

```
/api/v1/quotes ──poll 10s──▶ TransactionSource (mock | owlpay)
   │  (owlpay: adapt quotes, drop unknown-country ones, trickle/surge/dedupe, capped buffer)
   ▼
useLiveDashboard ──▶ live.transactions ──▶ ThreeGlobeCanvas (arcs)  +  HUD panels (FuturisticPanel)
```

Three caps worth knowing (all adjustable in the in-app **Settings** ⚙ panel):

| Layer | Default | Setting |
| --- | --- | --- |
| Queue (FS-04) shows latest N | 10 | Queue Rows |
| In-memory buffer | 200 | Buffer Size |
| Globe-rendered arcs (top N of buffer) | 160 | Flow Count |

A transaction in the buffer doesn't always have an arc — only the top
`Flow Count` are drawn; older ones fade out. The HUD also exposes a **HUD Scale**
slider for large/wall displays.

## Project layout

```
src/
  App.tsx                       app shell, boot gate, data wiring
  components/
    globe/                      Three.js globe render path (performance-sensitive)
    FuturisticPanel/            HUD card system (frame, collapse, drag, scale)
    GlobeSettings.tsx           in-app tuning panel
  services/transactions/        data sources: mockSource, owlpaySource (+ adapter, simulator)
  hooks/useLiveDashboard.ts     subscribes a source → transactions state
  data/                         country coordinates / names
docs/                           contracts, plans, and design specs (Traditional Chinese)
```

## Gotchas

- **Bundler is `rolldown-vite`**, not vanilla Vite — verify plugin/config support against rolldown-vite docs.
- The **Three.js render path** (`components/globe/`) is performance-sensitive: avoid per-frame allocations and React re-renders that rebuild the scene.
- For a 24/7 deployment, the transaction buffer and per-frame allocations are bounded on purpose — see `docs/superpowers/plans/2026-06-05-live-dashboard-performance.md`.

## Docs

- [`docs/api-contract.md`](docs/api-contract.md) — front/back data contract
- [`docs/boot-loading-plan.md`](docs/boot-loading-plan.md) — boot & loading model
- [`docs/globe-visual-baseline.md`](docs/globe-visual-baseline.md) — globe look/behavior baseline
- [`docs/known-issues.md`](docs/known-issues.md) — known issues
- `docs/superpowers/` — design specs and implementation plans
- [`CLAUDE.md`](CLAUDE.md) — guidance for AI coding agents

> Note: files under `docs/` are written in Traditional Chinese.
