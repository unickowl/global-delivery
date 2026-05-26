# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

OwlPay monitoring dashboard for on-ramp/off-ramp transactions, visualized on an interactive Three.js globe. React 18 + TypeScript, bundled with **rolldown-vite** (not standard Vite). Package manager is **pnpm**.

## Commands

- `pnpm dev` — start dev server (binds 0.0.0.0)
- `pnpm build` — production build (vite, does not typecheck)
- `pnpm lint` — run oxlint on `src/`
- `pnpm exec tsc --noEmit` — typecheck (no script; run directly)
- `pnpm preview` — preview built artifacts

No test framework is configured.

## Verification before reporting done

Run `pnpm build` after any non-trivial change. Vite doesn't typecheck during build — run `pnpm exec tsc --noEmit` separately when types matter. UI behavior is not auto-tested — say so explicitly when you can't verify visually rather than claiming success.

Note: the codebase currently has several pre-existing TS errors (see `src/components/FuturisticPanel/`, `src/components/ThreeGlobeCanvas.tsx`) that vite swallows but tsc reports. New code should not add to that count.

## Working style

- Be terse. No end-of-turn summaries — the diff speaks for itself.
- For multi-file or architectural changes, propose a plan first and wait for approval before editing.

## Gotchas

- **Bundler is `rolldown-vite`**, not vanilla Vite. Some Vite plugins or config options may behave differently or be unsupported. Verify against rolldown-vite docs before adding plugins.
- **Three.js render path in `src/components/ThreeGlobeCanvas`** is performance-sensitive. Avoid per-frame allocations, watch for React re-renders triggering scene rebuilds, and prefer mutating existing objects over recreating them.
- Docs in `docs/` (e.g. `api-contract.md`) are written in Traditional Chinese.

## Reference

- API contract: @docs/api-contract.md
- Globe visual baseline: @docs/globe-visual-baseline.md
- Boot/loading plan: @docs/boot-loading-plan.md
