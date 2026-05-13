# Boot and Loading Plan

This document describes how the monitor should start once real backend APIs replace the current frontend-only mock data.

## Goal

The first viewport should not show a partially empty monitor. The globe, HUD cards, transaction queue, and live route animation should enter as a coordinated system.

Use a two-layer loading model:

- Full-screen boot gate for the minimum data needed to make the monitor coherent.
- Per-card loading/degraded states for non-critical or slow secondary APIs.

## Minimum Data Before Opening HUD

The app should wait for these snapshot payloads before revealing the full monitor:

- `transactions`: initial buffer, up to 300 items, newest first.
- `metrics`: network load summary for `FS-02`.
- `liquidityPools`: pool utilization for `FS-03`.
- `ops`: KYT/liquidity/rail summary for `FS-01`.
- `railStatuses`: core health for `FS-00`.

The app can open without these secondary datasets:

- Transaction detail timeline.
- Corridor drilldown.
- Risk drilldown.
- Historical provider latency.
- Detailed balance inventory.

Those should render with card-level loading, fallback, or degraded states.

## Suggested State Machine

```ts
type BootState =
  | "connecting"
  | "loading-snapshot"
  | "hydrating-globe"
  | "opening-stream"
  | "ready"
  | "degraded"
```

Recommended flow:

1. `connecting`
   - Show full-screen boot screen.
   - Establish API base config and auth/session context.
2. `loading-snapshot`
   - Fetch snapshot APIs in parallel.
   - Keep the HUD closed.
3. `hydrating-globe`
   - Mount globe with surface/land only.
   - Do not draw transaction routes yet.
4. `opening-stream`
   - Start SSE or WebSocket.
   - Buffer incoming transaction events if the globe boot animation is still running.
5. `ready`
   - Reveal HUD.
   - Start route drawing from the transaction buffer.
6. `degraded`
   - Main monitor is usable, but at least one non-critical API or stream is unhealthy.
   - Show degraded state in `FS-00` or `FS-01`, not a full-screen loader.

## Globe Route Timing

The globe has its own initial presentation animation. Routes should not appear immediately on mount.

Current frontend behavior:

- Globe surface appears first.
- Route drawing is held for `GLOBE_ROUTE_BOOT_DELAY_MS`.
- After the globe is visually established, the renderer begins syncing routes from `transactions`.
- Failed transactions still render as red breathing lines once routes are enabled.

This should remain true after API integration:

```ts
const routesReady =
  bootState === "ready" &&
  globeIntroComplete &&
  transactions.length > 0
```

While `routesReady` is false:

- Keep globe surface, land, grid settings, and interaction available.
- Do not create route flows.
- Do not show route shimmer, large transaction dots, or failed red routes.

When `routesReady` becomes true:

- Seed route flows from the current transaction buffer.
- New live transactions are inserted at the top and start their normal draw animation.
- Removed old transactions fade out.

## API Loading Strategy

Use a single initial snapshot endpoint if backend ownership allows it:

```http
GET /api/monitor/snapshot?limit=300
```

If multiple APIs are required, fetch them in parallel:

```ts
await Promise.all([
  fetchTransactions({ limit: 300 }),
  fetchMetrics(),
  fetchLiquidityPools(),
  fetchOpsStatus(),
  fetchRailStatuses(),
])
```

Only after the minimum set succeeds should the UI leave the full-screen boot gate.

## Error Handling

Critical failures:

- Cannot load transaction snapshot.
- Cannot load enough system health to determine monitor state.

Behavior:

- Keep full-screen boot in a retry/error state.
- Provide retry action.

Non-critical failures:

- Corridor details unavailable.
- Risk drilldown unavailable.
- Transaction timeline unavailable.
- Some pool balance details unavailable.

Behavior:

- Enter `degraded`.
- Show local card fallback.
- Keep live transaction monitor running.

## SSE / Socket Timing

After snapshot success:

1. Open stream.
2. Apply live events to the same transaction buffer used by the globe.
3. If stream opens before `routesReady`, update the buffer but delay route drawing.
4. If stream disconnects after ready, keep current data on screen and show reconnecting/degraded status.

