# ThreeGlobeCanvas Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/components/ThreeGlobeCanvas.tsx` (1658 lines) into focused modules organized by lifecycle (geometry, flows, interaction, animation) so the file becomes browsable and the pure logic becomes testable.

**Architecture:** This is a **strict extraction-only refactor** — no behavior changes. Move existing top-level pure functions into `src/components/globe/lib/`, leaving the main component as orchestration + the React `useEffect` that sets up the Three.js scene. Each task moves one cohesive group of functions, recompiles, and visually verifies the globe still renders identically. The final file should be ~500–700 lines focused only on the component itself.

**Tech Stack:** TypeScript, React 19, Three.js 0.184, animejs 4, Vitest (added by service-layer plan).

**Prerequisite:** The service-layer plan must be merged first (this plan assumes Vitest is configured).

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/components/globe/ThreeGlobeCanvas.tsx` | Move + slim | Component, props, scene setup `useEffect`, refs |
| `src/components/globe/lib/vec3.ts` | Create | `toVec3`, `setVec3FromLatLng`, `toVector3`, `copyVec3`, `slerpInto`, `normalizeVec`, scalar helpers (`clamp`, `easeInOutQuad`, `easeOutCubic`) |
| `src/components/globe/lib/rotation.ts` | Create | `rotationTargetForLatLng`, `easeRotationToward`, `frontFacingRotationSeed`, `solveRotationForScreenPoint`, `rotationTargetForVec` |
| `src/components/globe/lib/projection.ts` | Create | `projectedNdcForRotation`, `rotatedDepth`, `isFrontHemisphere` + scratch vars |
| `src/components/globe/lib/route.ts` | Create | `routeSurfacePoint(Into)`, `cameraFocusPointInto`, `liftedPoint(Into)`, `createArcPoints`, `constrainCameraCorridor` |
| `src/components/globe/lib/landPoints.ts` | Create | `createLandPoints` |
| `src/components/globe/lib/flow.ts` | Create | `FlowTx`, `FlowNode`, `FlowPhase`, `buildNodes`, `createFlow`, `createTransactionFlow`, `flowNodeFromPoint`, `flowArcHeight`, `cancelFlowAnimations`, `addFlowAnimation`, `startBreathingAnimation`, `startFlowFade`, `startFlowAnimation`, `updateFlows`, `seedInitialTransactionFlows` |
| `src/components/globe/lib/flowRendering.ts` | Create | `lineSegmentsFromFlows`, `shimmerSegmentsFromFlows`, `largeTrailSegmentsFromFlows`, `failedSegmentsFromFlows`, `selectedRouteSegments`, `selectedRouteSegmentsProgress`, `pushArcRange`, `gridSegments` |
| `src/components/globe/lib/three-objects.ts` | Create | `makeGlobeMaterial`, `createGlowSprite`, `createGlowTexture`, `drawGlow`, `createFatSegments`, `setFatSegments`, `disposeFatSegments`, `setSegments`, `orientToSurface`, `positionLabelAtVec`, `resizeCanvas`, `drawFlightScene` |
| `src/components/globe/lib/settings.ts` | Create | `renderFlowCount`, `effectiveGlobeSettings` |
| `src/components/globe/lib/constants.ts` | Create | All `const` timings + caps + `EXTRA_NODES` |
| `src/components/globe/lib/vec3.test.ts` | Create | Tests for pure scalar/vec helpers |
| `src/components/globe/lib/route.test.ts` | Create | Tests for `slerpInto`, `routeSurfacePoint`, `constrainCameraCorridor` |
| `src/components/ThreeGlobeCanvas.tsx` | Delete | Re-export shim from new path → eventually deleted |

---

### Task 1: Set up directory + re-export shim

**Files:**
- Create: `src/components/globe/index.ts`
- Modify: `src/components/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Create the globe directory**

```bash
mkdir -p src/components/globe/lib
```

- [ ] **Step 2: Move file to new location preserving git history**

```bash
git mv src/components/ThreeGlobeCanvas.tsx src/components/globe/ThreeGlobeCanvas.tsx
```

- [ ] **Step 3: Re-export from `globe/index.ts`**

Create `src/components/globe/index.ts`:

```ts
export { ThreeGlobeCanvas } from "./ThreeGlobeCanvas"
```

- [ ] **Step 4: Add a re-export shim at the old path**

Create `src/components/ThreeGlobeCanvas.tsx` (new, one-liner):

```ts
export { ThreeGlobeCanvas } from "./globe"
```

- [ ] **Step 5: Verify build still works**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/ThreeGlobeCanvas.tsx src/components/globe/
git commit -m "refactor(globe): move ThreeGlobeCanvas into globe/ directory"
```

---

### Task 2: Extract constants

**Files:**
- Create: `src/components/globe/lib/constants.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Create `constants.ts`**

Cut lines 55–96 (all `const` and `EXTRA_NODES`) from `src/components/globe/ThreeGlobeCanvas.tsx` into `src/components/globe/lib/constants.ts`, adding `export` to each:

```ts
export const MAX_FLOWS = 300
export const ARRIVING_MS = 1600
export const FLYING_MS = 3200
export const LANDING_MS = 1200
export const FADING_MS = 1500
export const ARC_SEGMENTS = 32
export const FOCUS_SOURCE_MS = 1600
export const FOCUS_LABEL_MS = 1200
export const FOCUS_FLIGHT_MS = 5600
export const FOCUS_TARGET_MS = 1600
export const MONITOR_FRAME_MS = 1000 / 45
export const INTERACTIVE_FRAME_MS = 1000 / 60
export const FULL_PERFORMANCE_FRAME_MS = 1000 / 60
export const GEOMETRY_UPDATE_MS = 360
export const GEOMETRY_UPDATE_DRAG_MS = 520
export const FULL_PERFORMANCE_GEOMETRY_UPDATE_MS = 120
export const EMPTY_SEGMENTS = new Float32Array()
export const CAMERA_CORRIDOR_MAX_Y = 0.52
export const MAX_VIEW_THETA = Math.PI / 2 - 0.04

export type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
import type { Vec3 } from "./vec3"

export const EXTRA_NODES: Array<Omit<FlowNode, "vec">> = [
  // ...copy lines 76–96 verbatim
]
```

(Vec3 import will be valid after Task 3 — for now, declare it inline if needed.)

- [ ] **Step 2: Add import to `ThreeGlobeCanvas.tsx`**

At the top of `src/components/globe/ThreeGlobeCanvas.tsx`, add:

```ts
import {
  MAX_FLOWS, ARRIVING_MS, FLYING_MS, LANDING_MS, FADING_MS, ARC_SEGMENTS,
  FOCUS_SOURCE_MS, FOCUS_LABEL_MS, FOCUS_FLIGHT_MS, FOCUS_TARGET_MS,
  MONITOR_FRAME_MS, INTERACTIVE_FRAME_MS, FULL_PERFORMANCE_FRAME_MS,
  GEOMETRY_UPDATE_MS, GEOMETRY_UPDATE_DRAG_MS, FULL_PERFORMANCE_GEOMETRY_UPDATE_MS,
  EMPTY_SEGMENTS, CAMERA_CORRIDOR_MAX_Y, MAX_VIEW_THETA, EXTRA_NODES,
} from "./lib/constants"
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Visual check**

Run `pnpm dev`, load page, verify globe renders and flows animate. Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/components/globe/lib/constants.ts src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract constants to lib/constants.ts"
```

---

### Task 3: Extract `vec3` math with tests

**Files:**
- Create: `src/components/globe/lib/vec3.ts`
- Create: `src/components/globe/lib/vec3.test.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Write failing tests**

`src/components/globe/lib/vec3.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { clamp, easeInOutQuad, easeOutCubic, normalizeVec, slerpInto, toVec3 } from "./vec3"

describe("clamp", () => {
  it("clamps within range", () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })
})

describe("easeInOutQuad", () => {
  it("returns 0 at 0", () => expect(easeInOutQuad(0)).toBe(0))
  it("returns 1 at 1", () => expect(easeInOutQuad(1)).toBe(1))
  it("returns 0.5 at 0.5", () => expect(easeInOutQuad(0.5)).toBeCloseTo(0.5, 5))
})

describe("easeOutCubic", () => {
  it("returns 0 at 0", () => expect(easeOutCubic(0)).toBe(0))
  it("returns 1 at 1", () => expect(easeOutCubic(1)).toBe(1))
})

describe("toVec3", () => {
  it("returns a unit-length vector for lat/lng on equator", () => {
    const v = toVec3(0, 0)
    const len = Math.hypot(v[0], v[1], v[2])
    expect(len).toBeCloseTo(1, 5)
  })
})

describe("normalizeVec", () => {
  it("normalizes a non-unit vector to length 1", () => {
    const v: [number, number, number] = [3, 0, 0]
    normalizeVec(v)
    expect(Math.hypot(v[0], v[1], v[2])).toBeCloseTo(1, 5)
  })
})

describe("slerpInto", () => {
  it("returns a at t=0", () => {
    const target: [number, number, number] = [0, 0, 0]
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    slerpInto(target, a, b, 0)
    expect(target[0]).toBeCloseTo(1, 5)
    expect(target[1]).toBeCloseTo(0, 5)
  })
  it("returns b at t=1", () => {
    const target: [number, number, number] = [0, 0, 0]
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    slerpInto(target, a, b, 1)
    expect(target[0]).toBeCloseTo(0, 5)
    expect(target[1]).toBeCloseTo(1, 5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run vec3`
Expected: FAIL ("Cannot find module './vec3'").

- [ ] **Step 3: Create `vec3.ts` by extracting from `ThreeGlobeCanvas.tsx`**

Move from `src/components/globe/ThreeGlobeCanvas.tsx` (approximately lines 27, 98–144, 245–270):
- `Vec3` type (line 27)
- `clamp`, `easeInOutQuad`, `easeOutCubic` (98–108)
- `toVec3`, `setVec3FromLatLng`, `toVector3`, `copyVec3` (110–136)
- `slerpInto`, `normalizeVec` (245–270)

Add `export` to each.

```ts
import * as THREE from "three"

export type Vec3 = [number, number, number]

export function clamp(value: number, min: number, max: number) { /* ... */ }
export function easeInOutQuad(t: number) { /* ... */ }
export function easeOutCubic(t: number) { /* ... */ }
export function toVec3(lat: number, lng: number): Vec3 { /* ... */ }
export function setVec3FromLatLng(target: Vec3, lat: number, lng: number) { /* ... */ }
export function toVector3(vec: Vec3, scale = 1) { /* ... */ }
export function copyVec3(target: THREE.Vector3, vec: Vec3, scale = 1) { /* ... */ }
export function slerpInto(target: Vec3, a: Vec3, b: Vec3, t: number) { /* ... */ }
export function normalizeVec(target: Vec3) { /* ... */ }
```

Copy each function body verbatim from the source — do not modify.

In `ThreeGlobeCanvas.tsx`, replace the moved functions with an import:

```ts
import {
  type Vec3, clamp, easeInOutQuad, easeOutCubic,
  toVec3, setVec3FromLatLng, toVector3, copyVec3,
  slerpInto, normalizeVec,
} from "./lib/vec3"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run vec3`
Expected: 7 tests PASS.

- [ ] **Step 5: Verify build + visual**

Run: `pnpm build` (succeeds), then `pnpm dev` and confirm globe renders unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/globe/lib/vec3.ts src/components/globe/lib/vec3.test.ts src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract vec3 math to lib with tests"
```

---

### Task 4: Extract rotation and projection helpers

**Files:**
- Create: `src/components/globe/lib/rotation.ts`
- Create: `src/components/globe/lib/projection.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Create `projection.ts`**

Move from source (approximately lines 152–192, 948–953):

- `ProjectedPoint` type + `projectionScratch` + `projectionEuler` scratch vars (152–155)
- `projectedNdcForRotation` (157–168)
- `rotatedDepth` (169–175)
- `frontFacingRotationSeed` (176–192)
- `isFrontHemisphere` (948–953)

```ts
import * as THREE from "three"
import type { Vec3 } from "./vec3"

export type ProjectedPoint = { x: number; y: number; z: number }

const projectionScratch = new THREE.Vector3()
const projectionEuler = new THREE.Euler(0, 0, 0, "YXZ")

export function projectedNdcForRotation(/* ... */) { /* verbatim */ }
export function rotatedDepth(/* ... */) { /* verbatim */ }
export function frontFacingRotationSeed(/* ... */) { /* verbatim */ }
export function isFrontHemisphere(/* ... */) { /* verbatim */ }
```

- [ ] **Step 2: Create `rotation.ts`**

Move from source (approximately lines 138–151, 194–243):

- `rotationTargetForLatLng` (138–143)
- `easeRotationToward` (145–151)
- `solveRotationForScreenPoint` (200–243)
- `rotationTargetForVec` (194–199)

```ts
import type { MutableRefObject } from "react"
import { clamp } from "./vec3"
import type { Vec3 } from "./vec3"
import { MAX_VIEW_THETA } from "./constants"

export function rotationTargetForLatLng(/* ... */) { /* verbatim */ }
export function easeRotationToward(/* ... */) { /* verbatim */ }
export function rotationTargetForVec(/* ... */) { /* verbatim */ }
export function solveRotationForScreenPoint(/* ... */) { /* verbatim */ }
```

- [ ] **Step 3: Update imports in `ThreeGlobeCanvas.tsx`**

```ts
import {
  type ProjectedPoint, projectedNdcForRotation, rotatedDepth,
  frontFacingRotationSeed, isFrontHemisphere,
} from "./lib/projection"
import {
  rotationTargetForLatLng, easeRotationToward,
  rotationTargetForVec, solveRotationForScreenPoint,
} from "./lib/rotation"
```

- [ ] **Step 4: Verify build + visual**

Run: `pnpm build`, then `pnpm dev` and confirm globe rotates correctly when dragging.

- [ ] **Step 5: Commit**

```bash
git add src/components/globe/lib/ src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract rotation and projection helpers"
```

---

### Task 5: Extract route geometry with tests

**Files:**
- Create: `src/components/globe/lib/route.ts`
- Create: `src/components/globe/lib/route.test.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Write failing tests**

`src/components/globe/lib/route.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { constrainCameraCorridor, routeSurfacePoint } from "./route"
import { CAMERA_CORRIDOR_MAX_Y } from "./constants"

describe("constrainCameraCorridor", () => {
  it("does not alter a vector inside the corridor", () => {
    const v: [number, number, number] = [1, 0, 0]
    constrainCameraCorridor(v)
    expect(v[1]).toBe(0)
  })
  it("clamps y above the corridor max", () => {
    const v: [number, number, number] = [0, 1, 0]
    constrainCameraCorridor(v)
    expect(Math.abs(v[1])).toBeLessThanOrEqual(CAMERA_CORRIDOR_MAX_Y + 0.001)
  })
})

describe("routeSurfacePoint", () => {
  it("returns a unit-length vector for any t in [0,1]", () => {
    const a: [number, number, number] = [1, 0, 0]
    const b: [number, number, number] = [0, 1, 0]
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const p = routeSurfacePoint(a, b, t)
      expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(1, 5)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run route`
Expected: FAIL.

- [ ] **Step 3: Create `route.ts`**

Move from source (approximately lines 271–349):
- `constrainCameraCorridor` (271–291)
- `routeSurfacePointInto`, `cameraFocusPointInto`, `routeSurfacePoint` (293–317)
- `liftedPointInto`, `liftedPoint` (319–340)
- `createArcPoints` (342–349)

```ts
import { type Vec3, slerpInto, normalizeVec } from "./vec3"
import { ARC_SEGMENTS, CAMERA_CORRIDOR_MAX_Y } from "./constants"
// FocusPhase imported below once flow.ts exists; for now declare it inline:
type FocusPhase = "idle" | "approach-source" | "source-label" | "flight" | "target-label"

export function constrainCameraCorridor(/* ... */) { /* verbatim */ }
export function routeSurfacePointInto(/* ... */) { /* verbatim */ }
export function cameraFocusPointInto(/* ... */) { /* verbatim */ }
export function routeSurfacePoint(/* ... */) { /* verbatim */ }
export function liftedPointInto(/* ... */) { /* verbatim */ }
export function liftedPoint(/* ... */) { /* verbatim */ }
export function createArcPoints(/* ... */) { /* verbatim */ }
```

- [ ] **Step 4: Update imports in `ThreeGlobeCanvas.tsx`**

```ts
import {
  constrainCameraCorridor, routeSurfacePoint, routeSurfacePointInto,
  cameraFocusPointInto, liftedPoint, liftedPointInto, createArcPoints,
} from "./lib/route"
```

- [ ] **Step 5: Run tests + verify build + visual**

```bash
pnpm test:run route
pnpm build
```

Then `pnpm dev` and verify route arcs render correctly between source/target.

- [ ] **Step 6: Commit**

```bash
git add src/components/globe/lib/route.ts src/components/globe/lib/route.test.ts src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract route geometry with tests"
```

---

### Task 6: Extract `landPoints`, `three-objects`, `settings`

**Files:**
- Create: `src/components/globe/lib/landPoints.ts`
- Create: `src/components/globe/lib/three-objects.ts`
- Create: `src/components/globe/lib/settings.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

- [ ] **Step 1: Create `landPoints.ts`**

Move `createLandPoints` (approximately lines 350–357):

```ts
import type { Vec3 } from "./vec3"
import { setVec3FromLatLng } from "./vec3"

export type LandPoint = { vec: Vec3; seed: number; coast: boolean }

export function createLandPoints(): LandPoint[] { /* verbatim */ }
```

- [ ] **Step 2: Create `three-objects.ts`**

Move from source (approximately lines 671–706, 875–1043):
- `makeGlobeMaterial` (671–706)
- `orientToSurface` (875–878)
- `positionLabelAtVec` (880–894)
- `createGlowSprite` (896–909)
- `setSegments` (911–916)
- `createFatSegments` (918–932)
- `setFatSegments` (934–941)
- `disposeFatSegments` (943–947)
- `createGlowTexture` (953–969)
- `drawGlow` (971–980)
- `drawFlightScene` (982–1035)
- `resizeCanvas` (1037–1044)

```ts
import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { Vec3 } from "./vec3"

export function makeGlobeMaterial() { /* verbatim */ }
// ...etc
```

- [ ] **Step 3: Create `settings.ts`**

Move from source (approximately lines 579–589):

```ts
import type { GlobeSettingsState } from "../../GlobeSettings" // adjust path if needed

export function renderFlowCount(settings: GlobeSettingsState) { /* verbatim */ }
export function effectiveGlobeSettings(settings: GlobeSettingsState, fullPerformance: boolean): GlobeSettingsState { /* verbatim */ }
```

Resolve the `GlobeSettingsState` import — find where it's currently imported in `ThreeGlobeCanvas.tsx` and use the same path.

- [ ] **Step 4: Update imports in `ThreeGlobeCanvas.tsx`**

- [ ] **Step 5: Verify build + visual**

```bash
pnpm build
```

Then `pnpm dev` — confirm globe land, focus labels, and flight-mode canvas all render.

- [ ] **Step 6: Commit**

```bash
git add src/components/globe/lib/ src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract land/three-objects/settings helpers"
```

---

### Task 7: Extract flow factory + rendering

**Files:**
- Create: `src/components/globe/lib/flow.ts`
- Create: `src/components/globe/lib/flowRendering.ts`
- Modify: `src/components/globe/ThreeGlobeCanvas.tsx`

This is the largest extraction — be careful, take it slow.

- [ ] **Step 1: Create `flow.ts`**

Move from source (approximately lines 12, 29–54, 358–578, 591–670, 801–818):
- `GlobeMode` type (12) — keep here, it's a flow-state concept
- `FlowPhase`, `FlowNode`, `FlowTx` types (29–54)
- `logNormalAmount`, `hashText` (358–369)
- `buildNodes` (371–384)
- `createFlow` (385–420)
- `flowNodeFromPoint` (421–430)
- `flowArcHeight` (431–434)
- `createTransactionFlow` (435–468)
- `cancelFlowAnimations` (469–473)
- `addFlowAnimation` (474–478)
- `startBreathingAnimation` (479–491)
- `startFlowFade` (492–507)
- `startFlowAnimation` (508–578)
- `updateFlows` (591–670)
- `seedInitialTransactionFlows` (801–818)

```ts
import { animate } from "animejs"
import type { MutableRefObject } from "react"
import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../GlobeSettings"
import type { Vec3 } from "./vec3"
import { /* required helpers */ } from "./vec3"
import { /* arc/route helpers */ } from "./route"
import { ARRIVING_MS, FLYING_MS, LANDING_MS, FADING_MS, MAX_FLOWS, EXTRA_NODES } from "./constants"

export type GlobeMode = "monitor" | "focus" | "flight" | "success"
export type FlowPhase = "arriving" | "flying" | "landing" | "drawing" | "breathing" | "fading"
export type FlowNode = { city: string; country: string; lat: number; lng: number; vec: Vec3 }
export type FlowTx = { /* verbatim */ }

// ...all the moved functions
```

- [ ] **Step 2: Create `flowRendering.ts`**

Move from source (approximately lines 707–874):
- `lineSegmentsFromFlows` (707–732)
- `pushArcRange` (733–743)
- `shimmerSegmentsFromFlows` (744–763)
- `largeTrailSegmentsFromFlows` (764–782)
- `failedSegmentsFromFlows` (783–800)
- `selectedRouteSegments` (819–835)
- `selectedRouteSegmentsProgress` (836–852)
- `gridSegments` (853–874)

```ts
import type { Transaction } from "../../../data/transactions"
import type { GlobeSettingsState } from "../../GlobeSettings"
import type { FlowTx } from "./flow"
import { EMPTY_SEGMENTS, ARC_SEGMENTS } from "./constants"
import { type Vec3, clamp } from "./vec3"
import { createArcPoints, routeSurfacePoint } from "./route"

export function lineSegmentsFromFlows(/* ... */) { /* verbatim */ }
// ...etc
```

- [ ] **Step 3: Update imports in `ThreeGlobeCanvas.tsx`**

```ts
import {
  type FlowTx, type FlowNode, type FlowPhase, type GlobeMode,
  buildNodes, createFlow, createTransactionFlow, flowNodeFromPoint,
  flowArcHeight, cancelFlowAnimations, addFlowAnimation,
  startBreathingAnimation, startFlowFade, startFlowAnimation,
  updateFlows, seedInitialTransactionFlows, logNormalAmount, hashText,
} from "./lib/flow"
import {
  lineSegmentsFromFlows, shimmerSegmentsFromFlows,
  largeTrailSegmentsFromFlows, failedSegmentsFromFlows,
  selectedRouteSegments, selectedRouteSegmentsProgress, gridSegments,
} from "./lib/flowRendering"
```

- [ ] **Step 4: Verify build + visual**

```bash
pnpm build
```

Then `pnpm dev` and verify:
- Flows animate (arrive → fly → land → fade)
- Large transactions show trail effect
- Failed transactions render in red
- Selected route highlights correctly in focus mode

- [ ] **Step 5: Commit**

```bash
git add src/components/globe/lib/flow.ts src/components/globe/lib/flowRendering.ts src/components/globe/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): extract flow factory and rendering"
```

---

### Task 8: Clean up shim and verify final state

**Files:**
- Delete: `src/components/ThreeGlobeCanvas.tsx` (shim)
- Modify: `src/App.tsx` (update import path)

- [ ] **Step 1: Update import in `App.tsx`**

```bash
grep -n "ThreeGlobeCanvas" src/App.tsx
```

Change the import from:
```ts
import { ThreeGlobeCanvas } from "./components/ThreeGlobeCanvas"
```
to:
```ts
import { ThreeGlobeCanvas } from "./components/globe"
```

- [ ] **Step 2: Delete the shim**

```bash
git rm src/components/ThreeGlobeCanvas.tsx
```

- [ ] **Step 3: Check no other files import the old path**

```bash
grep -rn "from.*components/ThreeGlobeCanvas" src/
```

Expected: no results. If any appear, fix them to use `./components/globe`.

- [ ] **Step 4: Final build + visual verification**

```bash
pnpm build
pnpm test:run
```

Both should succeed. Then `pnpm dev` and walk through every interaction: drag, zoom, click transaction, focus mode, flight mode, return to monitor.

- [ ] **Step 5: Verify final file size**

```bash
wc -l src/components/globe/ThreeGlobeCanvas.tsx
```

Expected: between 500 and 800 lines (down from 1658).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components/ThreeGlobeCanvas.tsx
git commit -m "refactor(globe): remove re-export shim, use canonical path"
```

---

## Self-Review Checklist (run before merging)

- [ ] `wc -l src/components/globe/ThreeGlobeCanvas.tsx` shows < 800 lines
- [ ] All `vec3.test.ts` and `route.test.ts` cases pass
- [ ] `pnpm build` succeeds with no new errors beyond pre-existing
- [ ] `pnpm dev` exhibits identical visual behavior to pre-refactor (drag, focus, flight, return)
- [ ] No file under `src/` other than `globe/ThreeGlobeCanvas.tsx` imports from `globe/lib/*` directly — that would mean cross-component leakage
- [ ] Git history preserved via `git mv` in Task 1
