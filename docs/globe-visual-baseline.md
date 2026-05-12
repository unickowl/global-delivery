# Globe Visual Baseline

This document is the visual and behavioral baseline for the current canvas globe. Any renderer rewrite, including a Three.js/WebGL rewrite, must preserve this look and interaction unless a change is explicitly requested.

## Overall Direction

- Premium fintech world monitor for stablecoin on-ramp/off-ramp flows.
- Dark cyberpunk control-room mood, not a bright marketing globe.
- The globe is the dominant first-viewport object and sits behind HUD panels.
- Visual density should feel live and institutional, but not noisy.
- All transaction graphics must appear attached to the globe's coordinate system.

## Globe Surface

- The globe is a dark, non-transparent sphere.
- Ocean uses a deep radial gradient:
  - front highlight: muted deep blue
  - mid: navy
  - edge: near-black blue
- Land is represented by dotted land mass sampling, not detailed geographic texture.
- Land points are subdued green/teal and must be visible enough to distinguish sea from land.
- The surface must stay dark enough that route lines and endpoint pulses remain legible.
- Optional grid is low alpha and should never dominate the surface.
- Rim glow is subtle blue and must not wash out transaction lines.

## Camera And Interaction

- Globe auto-rotates slowly in monitor mode.
- Pointer drag rotates longitude and pitch directly.
- Drag must feel responsive; route endpoints must remain locked to the rotating surface.
- Focus mode eases the selected route toward the front of the globe.
- Flight/success mode transitions away from the globe into the red tunnel tracking scene.
- During flight, surrounding HUD panels slide away and user can cancel from the overlay.

## Transaction Lifecycle

Transactions are not static permanent lines. They run through a lifecycle:

1. `arriving`: source pulse appears at the sender.
2. `flying`: large transaction light travels along the lifted arc.
3. `landing`: target pulse expands at the receiver.
4. `drawing`: normal transaction line draws in.
5. `breathing`: completed line remains as low-intensity live flow.
6. `fading`: old line fades out and disappears.

New transactions are continuously added so the dashboard feels live even with mock data.

## Route Geometry

- Routes are lifted great-circle arcs.
- Geometry is based on `lat/lng -> vec3 -> rotate -> project`.
- Arc lift uses midpoint direction plus `sin(pi * t)`.
- Endpoints, route curves, moving dots, and pulses must all share the same projection.
- When the globe rotates, endpoints cannot drift away from route ends or appear detached from the globe.

## Normal Route Style

Normal routes should be more visible than the first rough version, but not thick.

Current intended style:

- Thin fluid light band.
- Fine base glow along the route.
- Short moving highlight segment gliding along the line.
- Subtle breathing alpha.
- Cyan/teal color family, restrained saturation.
- No heavy permanent glow field.
- Visibility is achieved through alpha, small shadow/glow, and animated highlight, not large line width.

Tunable normal-line parameters:

- `normalLineWidth`: base width multiplier.
- `normalGlow`: soft glow/shadow intensity.
- `normalHighlight`: moving highlight alpha/intensity.
- `normalPulse`: breathing amplitude.
- `normalFlowSpeed`: speed of the short shimmer segment.

## Large Transaction Style

Large transactions should be visually distinct and more energetic than normal routes.

Current intended style:

- Warm yellow/orange source pulse.
- Faint full baseline route.
- Bright traveling head with short trailing arc.
- White-hot center dot with warm glow.
- Cyan target landing pulse.
- Only a limited number of large transactions animate at once.
- Amount influences visual prominence.

Tunable large-light parameters:

- `largeTrailLength`: length of the bright trailing segment.
- `largeGlow`: glow radius/intensity for trail and head dot.
- `largeDotScale`: size multiplier for the traveling dot and trail width.
- `largeFlightSpeed`: speed multiplier for the flying phase.

## Settings Panel

The settings panel is part of the product experience, not a debug-only control.

It currently exposes:

- Arc Height
- Rotate Speed
- Arc Brightness
- Large Tx Slots
- Draw Duration
- Large Threshold
- Flow Count
- Normal Lines controls
- Large Light controls
- Show Grid
- Animate Small Trades

The panel may scroll when needed. Controls should keep the same compact HUD style.

## HUD And Data Behavior

- Right-side transaction queue must continue changing with mock live data.
- Metrics and liquidity pools should continue updating.
- Sorted transaction feed should surface higher-value flows.
- Clicking a row enters focus mode for that transaction.
- The selected route is highlighted red/yellow/cyan and should remain visually separate from background flows.

## Three.js Rewrite Requirements

If the renderer is rewritten in Three.js/WebGL:

- Preserve the same color mood and density.
- Preserve the same transaction lifecycle.
- Preserve the same route prominence hierarchy: normal < selected < large.
- Preserve all user-facing settings and map them to equivalent shader/geometry parameters.
- Preserve route attachment to globe surface under rotation.
- Do not replace the current dark dotted land/ocean look with a bright stock earth texture unless explicitly requested.
- Do not make routes thicker to compensate for WebGL differences; use glow/highlight/shader alpha instead.
- Keep React HUD and interaction behavior consistent.

## Verification Checklist

- Globe shows distinguishable but dark sea and land.
- Auto-rotation is visible.
- Dragging rotates smoothly.
- Normal routes have subtle fluid shimmer.
- Large routes show flying light with trail and landing pulse.
- Old routes fade instead of staying forever.
- The transaction queue updates while the globe runs.
- Changing settings immediately affects the visual output.
- Route endpoints stay on the globe surface during rotation.
