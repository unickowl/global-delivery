# Design Tokens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a layered design-token system in CSS so that all colors, spacing, typography, and motion values become semantic, themeable, and reusable — replacing the current ad-hoc mix of `:root` variables and hardcoded `rgba()`/`px` values throughout `src/styles.css` (2572 lines).

**Architecture:** Three-layer token system. Layer 1 (`tokens.primitive.css`): raw values — every color, every spacing scale step. Layer 2 (`tokens.semantic.css`): semantic aliases (e.g., `--color-surface-panel: var(--color-blue-950)`) — this is what components reference. Layer 3 (existing `styles.css`): consumes only semantic tokens. Migration is **opportunistic, not big-bang**: define the token system, migrate Section 1 (Root) as the proving ground, then enforce "new CSS must use tokens" as a rule. Old hardcoded values get replaced when their surrounding section is next touched.

**Tech Stack:** Plain CSS variables (no preprocessor). No new dependencies.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/styles/tokens.primitive.css` | Create | Raw color/space/font/motion scales (one source of truth for every literal value) |
| `src/styles/tokens.semantic.css` | Create | Semantic aliases mapped to primitives (`--color-surface-panel`, `--space-md`, etc.) |
| `src/styles.css` | Modify | Import both token files at top, migrate Section 1 from old `--hud-*` names to semantic tokens, leave a deprecation comment on the old names |
| `docs/styling.md` | Create | One-page guide: which token to use when, naming convention, migration rule |
| `src/components/GlobeSettings.tsx` | Modify | (Task 6) "HUD Scale" control writing `--ui-scale` for large-display nudging |

---

### Task 1: Define primitive tokens

**Files:**
- Create: `src/styles/tokens.primitive.css`

- [ ] **Step 1: Inventory the existing literal values**

```bash
grep -oE 'rgba\([^)]+\)' src/styles.css | sort -u | head -30
grep -oE '#[0-9a-fA-F]{3,8}' src/styles.css | sort -u
grep -oE '[0-9]+px' src/styles.css | sort -u | head -30
```

Read the output and pick the value clusters. You're looking for 8–12 distinct color hues, 6–8 spacing steps, 3–4 font sizes, 3–4 timing curves. Don't try to capture every literal — capture the ones that appear ≥3 times.

- [ ] **Step 2: Write `tokens.primitive.css`**

```css
/* Primitive tokens — raw values, one source of truth.
 * Do NOT reference these directly in component CSS.
 * Reference them through semantic tokens in tokens.semantic.css instead.
 */
:root {
  /* === Color: cyan accent (HUD primary) === */
  --color-cyan-50:  #e8fbff;
  --color-cyan-200: #adfaff;
  --color-cyan-400: #7df6ff;
  --color-cyan-600: rgb(125 246 255 / 0.38);
  --color-cyan-800: rgb(125 246 255 / 0.22);

  /* === Color: blue background scale === */
  --color-blue-900: rgb(4 16 28 / 0.72);
  --color-blue-950: rgb(4 10 18 / 0.82);
  --color-blue-980: #060a10;
  --color-blue-990: #02040c;

  /* === Color: status (green / yellow / red) === */
  --color-green-400: #4ade80;
  --color-yellow-400: #f7ff4d;
  --color-red-500: #ff4a3a;

  /* === Spacing scale (4px base) === */
  --space-xs:   4px;
  --space-sm:   8px;
  --space-md:  16px;
  --space-lg:  24px;
  --space-xl:  40px;
  --space-2xl: 64px;

  /* === Border radius === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* === Typography: families === */
  --font-family-console: "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
  --font-family-boot:    "Sometype Mono", "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;

  /* === Typography: scale === */
  --font-size-xs:  11px;
  --font-size-sm:  13px;
  --font-size-md:  15px;
  --font-size-lg:  18px;
  --font-size-xl:  24px;

  /* === Motion: durations === */
  --motion-fast:  120ms;
  --motion-base:  240ms;
  --motion-slow:  480ms;

  /* === Motion: easing === */
  --motion-ease-standard: cubic-bezier(0.2, 0.0, 0.2, 1);
  --motion-ease-out:      cubic-bezier(0.0, 0.0, 0.2, 1);
  --motion-ease-in:       cubic-bezier(0.4, 0.0, 1, 1);

  /* === Shadow / glow === */
  --glow-cyan-soft:   0 0 12px rgb(125 246 255 / 0.22);
  --glow-cyan-strong: 0 0 24px rgb(125 246 255 / 0.45);
}
```

Adjust scale steps and hex values to match what you actually found in Step 1 — these defaults are a starting point.

> **Heads-up:** the `--space-*` and `--font-size-*` scales shown here in raw `px` are **superseded by Task 6**, which redefines them as `rem × var(--ui-scale)` for large-display scaling. If you're implementing Task 1 and Task 6 together, write the `rem`-based forms directly and skip the px versions.

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.primitive.css
git commit -m "feat(styles): add primitive design tokens"
```

---

### Task 2: Define semantic tokens

**Files:**
- Create: `src/styles/tokens.semantic.css`

- [ ] **Step 1: Map current `--hud-*` and `--panel-*` names to semantic tokens**

Read the top of `src/styles.css` (`:root` block, lines 4–28) and map each existing variable to a new semantic name.

```css
/* Semantic tokens — these are what component CSS references.
 * Component CSS should NEVER reference primitive tokens directly.
 * To re-theme: change a primitive value or remap a semantic alias.
 */
:root {
  /* Surfaces */
  --color-surface-app:        var(--color-blue-980);
  --color-surface-panel:      var(--color-blue-950);
  --color-surface-scrim:      var(--color-blue-990);

  /* Borders */
  --color-border-panel:       rgb(0 200 255 / 0.22);
  --color-border-panel-faint: rgb(0 200 255 / 0.1);

  /* Text */
  --color-text-primary:       var(--color-cyan-50);
  --color-text-secondary:     rgb(207 250 255 / 0.82);
  --color-text-label:         rgb(173 250 255 / 0.74);
  --color-text-muted:         rgb(207 250 255 / 0.5);

  /* Accent (HUD primary) */
  --color-accent:             var(--color-cyan-400);
  --color-accent-faint:       var(--color-cyan-800);

  /* Status */
  --color-status-success:     var(--color-green-400);
  --color-status-warning:     var(--color-yellow-400);
  --color-status-error:       var(--color-red-500);

  /* Scrollbar */
  --color-scrollbar-track:    var(--color-blue-900);
  --color-scrollbar-thumb:    var(--color-cyan-600);
  --color-scrollbar-thumb-hover: rgb(125 246 255 / 0.72);

  /* Typography */
  --font-console: var(--font-family-console);
  --font-boot:    var(--font-family-boot);

  /* Motion (semantic — match purpose, not value) */
  --motion-panel-open:  var(--motion-slow);
  --motion-panel-close: var(--motion-base);
  --motion-hover:       var(--motion-fast);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tokens.semantic.css
git commit -m "feat(styles): add semantic design tokens mapped to primitives"
```

---

### Task 3: Wire tokens into `styles.css` and migrate Section 1

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add token imports at the top of `styles.css`**

Insert after the Google Fonts `@import` (line 1) and before `/* ===== Section 1 — Root & Reset ===== */`:

```css
@import url("./styles/tokens.primitive.css");
@import url("./styles/tokens.semantic.css");
```

- [ ] **Step 2: Migrate Section 1 (`:root` block, lines 4–28) to use semantic tokens**

Replace the `:root` block in `src/styles.css` with:

```css
:root {
  /* === DEPRECATED — kept temporarily for un-migrated rules below. Do not use in new code. ===
   * Use the semantic tokens from tokens.semantic.css instead.
   * As sections below are touched, replace these names with their semantic equivalents
   * and remove the alias once nothing references it.
   */
  --hud-cyan:    var(--color-accent);
  --hud-green:   var(--color-status-success);
  --hud-yellow:  var(--color-status-warning);
  --hud-red:     var(--color-status-error);
  --hud-bg:      var(--color-surface-app);
  --panel-bg:    var(--color-surface-panel);
  --panel-border: var(--color-border-panel);
  --label-color: var(--color-text-label);
  --text-dim:    var(--color-text-secondary);
  --text-bright: var(--color-text-primary);
  --scrollbar-track:        var(--color-scrollbar-track);
  --scrollbar-thumb:        var(--color-scrollbar-thumb);
  --scrollbar-thumb-hover:  var(--color-scrollbar-thumb-hover);

  /* === Active === */
  --font-console: var(--font-family-console);
  --font-boot:    var(--font-family-boot);

  font-family: var(--font-console);
  color: var(--color-text-primary);
  background: var(--color-surface-app);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}
```

This keeps every existing `--hud-cyan` reference working but routes them through the new token system. **Do not touch the rest of `styles.css` yet.**

- [ ] **Step 3: Verify visual identity is unchanged**

Run: `pnpm dev`. Open the page and confirm:
- Globe background color is the same
- Panel backgrounds are the same
- Text color is the same
- Scrollbar looks the same
- No console errors about missing variables

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "refactor(styles): route Section 1 vars through semantic tokens"
```

---

### Task 4: Write the migration guide

**Files:**
- Create: `docs/styling.md`

- [ ] **Step 1: Write the guide**

```markdown
# Styling Conventions

## Token layers

CSS values live in a three-layer system. Reference each layer accordingly:

1. **`src/styles/tokens.primitive.css`** — raw values (hex, rgb, px, ms). Never reference these directly from component CSS.
2. **`src/styles/tokens.semantic.css`** — purpose-named aliases (`--color-surface-panel`, `--space-md`). **This is what component CSS references.**
3. **`src/styles.css`** — component rules; should only use semantic tokens (with the temporary deprecated `--hud-*` aliases tolerated until migration completes).

## Rule for new CSS

- **New rules must use semantic tokens.** No new hardcoded `rgba()`, `#hex`, `px` values for color/space/motion. If you need a value the tokens don't cover, add it to `tokens.primitive.css` and create a semantic alias.
- **Old rules migrate when their section is next touched.** Don't open a separate migration PR. When you touch a rule for any reason, replace its hardcoded values with semantic tokens in the same commit.

## When to add a new token

- The same literal value appears in ≥3 places.
- A reviewer asks "is this the same blue as X?" — that's a sign you need a named token.
- You want to expose a value to a future theme (light mode, accessibility variant).

## When NOT to add a new token

- One-off layout values that will never repeat (e.g., a specific `top: 23px` for a single element).
- Magic numbers that describe a relationship rather than a theme value (e.g., aspect ratios, computed offsets).

## Deprecated names

The variables in `:root` of `src/styles.css` prefixed `--hud-*`, `--panel-*`, `--text-*`, `--scrollbar-*`, `--label-*` are deprecated. They still resolve, but new code should use the semantic equivalents from `tokens.semantic.css`. Remove a deprecated name once `grep -rn "<name>" src/` returns nothing.
```

- [ ] **Step 2: Commit**

```bash
git add docs/styling.md
git commit -m "docs: add styling and token migration guide"
```

---

### Task 5: Add token reference to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a styling section**

Append to `CLAUDE.md`:

```markdown
## Styling

Design tokens live in `src/styles/tokens.primitive.css` (raw values) and `src/styles/tokens.semantic.css` (semantic aliases). New CSS must reference semantic tokens — no hardcoded `rgba()`, `#hex`, or `px` for color/space/motion. See @docs/styling.md.

Old `--hud-*`, `--panel-*`, etc. in `:root` of `styles.css` are deprecated aliases; they still work but new code uses the semantic names.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: reference design tokens in CLAUDE.md"
```

---

### Task 6: Viewport scaling for large displays (大螢幕適配)

**Why:** The monitor runs 24/7 on high-resolution wall screens viewed from 2–5 m, but the entire HUD is sized in fixed `px` down to 7–9px fonts and fixed panel widths/offsets (`top:16px`, `width:300px`). A high-DPI screen packs *more* pixels, not bigger ones, so fixed-px elements get physically **smaller** at distance — the opposite of what's needed. The globe (`<Canvas>`, fov-based) already self-scales; only the HUD layer needs a scaling basis. Existing "responsive" work only shrinks *down* to 720px (see `2026-05-12-monitor-redesign`); nothing scales *up*.

**Mechanism (decided):** hybrid — a pure-CSS fluid root `font-size` (automatic, no JS) **plus** a JS-set `--ui-scale` multiplier (default `1`) for manual nudging. Spatial tokens (type, spacing, panel geometry) are expressed in `rem` and multiplied by `var(--ui-scale)`, so one automatic knob (root font-size) and one manual knob (`--ui-scale`) move the whole HUD coherently.

> **Note:** a *unitless* viewport-driven scale factor is impossible in pure CSS — `calc()` can't divide a length into a ratio (`100vw / 1440px` is invalid). That's why the automatic part rides on root `font-size` + `rem`, and the manual `--ui-scale` is set from JS.

> **Implementation note (2026-06-05, first slice landed):** the steps below describe per-token `calc(rem * var(--ui-scale))`, but the cleaner approach actually shipped: `--ui-scale` is folded **once** into the root font-size — `font-size: calc(clamp(13px, 0.5vw + 9px, 34px) * var(--ui-scale))` — so every plain-`rem` token follows both knobs with no per-token wrapping. The live token set is `src/styles/tokens.primitive.css` (`--font-size-2xs…3xl`, `--size-panel-*`); treat that file as source of truth over the example blocks here. Done so far: **all** `font-size` in `styles.css` converted to rem tokens (0 px remaining), plus panel/​rail/​detail/​telemetry **offsets and widths**. Still px (next pass): most `padding`/`gap`/`margin`, borders/radii/shadows (the latter intentionally stay px).

**Files:**
- Modify: `src/styles/tokens.primitive.css` (add `--ui-scale`, convert spatial scales to `rem × scale`, add panel-geometry sizes)
- Modify: `src/styles.css` (add fluid root `font-size`; migrate Section 5 panel geometry — see Step 4)
- Modify: `src/components/GlobeSettings.tsx` (+ wherever settings state lives) — add a "HUD Scale" control
- Modify: `docs/styling.md` (document the scaling rule)

- [ ] **Step 1: Add the fluid root font-size + `--ui-scale` primitive**

In `src/styles/tokens.primitive.css` add:

```css
:root {
  /* === Viewport scaling ===
   * Automatic: root font-size scales with viewport width; every rem-based
   * token follows. Manual: --ui-scale (JS-set, default 1) nudges the whole
   * HUD for cases where viewport width is a poor proxy for viewing distance
   * (close-up 4K monitor vs. distant 1080p wall TV).
   */
  --ui-scale: 1;
}
```

And in `src/styles.css`, add the fluid root size to the existing `:root` block (the block migrated in Task 3) — this is the automatic knob:

```css
:root {
  font-size: clamp(13px, 0.5vw + 9px, 34px);
  /* ...existing font-family / color / background from Task 3... */
}
```

Resulting effective root size (1rem) and factor vs. a 16px baseline — **starting values, verify visually**:

| Viewport width | 1rem ≈ | factor |
| --- | --- | --- |
| 1280 (laptop)      | 15.4px | 0.96× |
| 1440               | 16.2px | 1.01× |
| 1920 (1080p wall)  | 18.6px | 1.16× |
| 2560 (1440p)       | 21.8px | 1.36× |
| 3440 (ultrawide)   | 26.2px | 1.64× |
| 3840 (4K wall)     | 28.2px | 1.76× |

Floor `13px` engages below ~800px; cap `34px` above ~5000px. Laptop ≈ 1.0× by design, so the current desktop look is preserved. Tune the `0.5vw + 9px` slope/offset and the `34px` cap against real screens — there is no UI auto-test in this repo (per CLAUDE.md), so this **must** be eyeballed at 1440 / 1920 / 2560 / 3840.

- [ ] **Step 2: Convert spatial primitives to `rem × var(--ui-scale)`**

Replace the fixed-px typography and spacing scales from Task 1 with rem values wrapped in the scale multiplier (16px = 1rem baseline):

```css
/* === Typography: scale (rem × manual scale) === */
--font-size-xs:  calc(0.6875rem * var(--ui-scale)); /* 11px */
--font-size-sm:  calc(0.8125rem * var(--ui-scale)); /* 13px */
--font-size-md:  calc(0.9375rem * var(--ui-scale)); /* 15px */
--font-size-lg:  calc(1.125rem  * var(--ui-scale)); /* 18px */
--font-size-xl:  calc(1.5rem    * var(--ui-scale)); /* 24px */
--font-size-2xl: calc(1.875rem  * var(--ui-scale)); /* 30px */

/* === Spacing scale (4px base → rem × manual scale) === */
--space-xs:  calc(0.25rem * var(--ui-scale)); /*  4px */
--space-sm:  calc(0.5rem  * var(--ui-scale)); /*  8px */
--space-md:  calc(1rem    * var(--ui-scale)); /* 16px */
--space-lg:  calc(1.5rem  * var(--ui-scale)); /* 24px */
--space-xl:  calc(2.5rem  * var(--ui-scale)); /* 40px */
--space-2xl: calc(4rem    * var(--ui-scale)); /* 64px */
```

**Stay in px (do NOT scale):** `1px` hairline borders, `--radius-*`, and `box-shadow`/blur radii. Scaling those makes borders fuzzy and glows bloom; only type / spacing / geometry should scale.

- [ ] **Step 3: Add panel-geometry size tokens**

The visible large-screen win comes from panels *spreading out*, not just bigger text. Add scaled geometry primitives for the fixed panel widths/insets currently hardcoded in Section 5:

```css
/* === Panel geometry (rem × manual scale) === */
--panel-inset:  calc(1rem      * var(--ui-scale)); /*  16px — top/left/right/bottom */
--panel-w-sm:   calc(11.875rem * var(--ui-scale)); /* 190px — metrics / liquidity */
--panel-w-md:   calc(18.75rem  * var(--ui-scale)); /* 300px — magi / transactions */
```

(Add more as Section 5 migration surfaces them. Map each in `tokens.semantic.css` to a purpose name, e.g. `--size-panel-inset`, `--size-panel-narrow`, `--size-panel-wide`.)

- [ ] **Step 4: Migrate Section 5 panel geometry NOW (not opportunistically)**

This is the one deliberate exception to the plan's opportunistic-migration rule. Typography scaling and panel-geometry scaling are coupled: if fonts grow via `rem` but a panel keeps a fixed-px width, text overflows. So in this task, migrate Section 5's panel rules (`.panel-system`, `.panel-magi`, `.panel-metrics`, `.panel-liquidity`, `.panel-transactions`, `.panel-detail`, `.dashboard-rail`, `.focus-telemetry`) — their `font-size`, padding/gap, `width`, and `top/left/right/bottom` offsets — to the scaled tokens above. Leave borders/radii/shadows in px.

- [ ] **Step 5: Add the manual "HUD Scale" control**

In `GlobeSettings.tsx`, add a slider wired to the existing settings/`usePersistentState` mechanism that writes the chosen factor to the root:

```ts
// range 0.7–2.0, step 0.05, default 1.0, persisted
document.documentElement.style.setProperty("--ui-scale", String(hudScale))
```

Label it "HUD Scale" alongside the other globe controls. This is the manual nudge for the viewport-width-≠-viewing-distance edge cases. **Automatic width-based mode-switching is intentionally NOT implemented** — the fluid root font-size covers the automatic case; `--ui-scale` is purely manual.

- [ ] **Step 6: Verify and commit**

Run `pnpm dev`; check at narrow (~1280) and, if available, a large display or browser-zoomed-out viewport that the HUD scales coherently (text, spacing, panels all grow together; globe unaffected; borders stay crisp). Drag the HUD Scale slider and confirm live response. Then:

```bash
git add src/styles/tokens.primitive.css src/styles/tokens.semantic.css src/styles.css src/components/GlobeSettings.tsx docs/styling.md
git commit -m "feat(styles): viewport scaling for large displays (rem + --ui-scale)"
```

---

## Self-Review Checklist (run before merging)

- [ ] `pnpm dev` renders identically to before this plan (no visual regressions)
- [ ] `src/styles/tokens.primitive.css` exists and contains color/space/font/motion scales
- [ ] `src/styles/tokens.semantic.css` exists and references only primitives, never raw literals
- [ ] `src/styles.css` imports both token files at the top
- [ ] The old `--hud-*` etc. names in `:root` all resolve to semantic tokens (no raw literal values left in that block)
- [ ] `docs/styling.md` exists and describes the migration rule
- [ ] `CLAUDE.md` references the new token files
- [ ] No other rules in `styles.css` were migrated in this plan — that's intentional; migration is opportunistic per the guide (Section 5 panel geometry in Task 6 is the one deliberate exception)
- [ ] `--ui-scale` primitive exists (default `1`); root `font-size` uses the fluid `clamp(...)`; spatial tokens are `rem × var(--ui-scale)`
- [ ] Borders, `--radius-*`, and shadow/blur radii stayed in `px` (only type/spacing/geometry scale)
- [ ] "HUD Scale" control writes `--ui-scale` and persists; dragging it rescales the HUD live; the globe is unaffected

## Out of Scope for This Plan

- Migrating all 2500+ lines of `styles.css` to semantic tokens. That happens opportunistically.
- Converting to CSS Modules.
- Introducing a CSS-in-JS library.
- Adding light/dark themes.

These are valid future plans — each should be a separate spec when the need arrives.
