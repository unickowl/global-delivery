---
name: verify-build
description: Run `pnpm build` to verify TypeScript compiles and the bundle produces. Use before reporting non-trivial changes complete, or when the user asks to verify the build.
---

Run `pnpm build` from the repo root.

If it succeeds, report the build time and bundle size summary from the output — nothing else.

If it fails:
1. Surface the first error verbatim (file path, line, message).
2. If there are multiple errors, group them by file and show the count.
3. Do **not** attempt fixes unless the user asks.

Notes:
- This project uses rolldown-vite, so build output formatting differs slightly from standard Vite. Trust the exit code, not output parsing.
- There is no separate typecheck script — `pnpm build` is the only TS check available.
