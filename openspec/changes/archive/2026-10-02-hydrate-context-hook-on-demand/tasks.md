## 1. Implementation

- [x] 1.1 Add `let hydrated = false` and `hydrateFromSession(ctx, loadSettings)` next to the other shared mutable state in `index.ts`: when `loadSettings` is true, `currentConfig.value = await loadConfig()`; then `indexer.reconstructFromSession(ctx)`, `blockRefs.rebuildFrom(indexer.getChainEntries().map((e) => e.blockId))`, `statsAccum.reconstructFromSession(ctx)`, `frontier.reconstructFromSession(ctx)`; finally `hydrated = true`
- [x] 1.2 `session_start`: replace the inline config-load and four reconstruction calls with `await hydrateFromSession(ctx, true)`, keeping `fallbackController.reset()`, `diagnostics.reset()`, the `supersede` resets, the `pendingBatches` clear, the rearm probe, and the widget updates after it
- [x] 1.3 `session_tree`: replace the inline reconstruction calls with `await hydrateFromSession(ctx, false)` so in-session `/pruner` config overrides survive tree navigation exactly as they do today
- [x] 1.4 `context` hook: as the first statement, `if (!hydrated) await hydrateFromSession(ctx, true)` — before the image-cap guard, which reads `currentConfig.value.maxImagesPerRequest`
- [x] 1.5 Confirm nothing else in `index.ts` depends on the previous ordering of the in-memory resets relative to `frontier.reconstructFromSession`

## 2. Tests (`src/reload-rearm.integration.test.ts`)

- [x] 2.1 Extend the harness with an `enabled?: boolean` settings override so a control case can boot with pruning off
- [x] 2.2 Race case: boot against a branch that carries the message chain plus a persisted `context-prune-index` custom entry, call **only** the `context` handler, and assert the `tc1` tool result is stub-replaced (its text mentions `context_tree_query`) — proving both the settings load and the index reconstruction happened on demand
- [x] 2.3 Control case: same branch with `enabled: false` in settings; the `context` handler must return the messages unchanged, proving hydration does not enable pruning by itself
- [x] 2.4 Idempotence case: run `session_start` and then the `context` handler on the same boot; the result must match the pre-change behavior (no double-prune, no diagnostics regression)

## 3. Gates

- [x] 3.1 `bun run typecheck` clean
- [x] 3.2 `bun test` green, with the new cases failing when `hydrateFromSession` is not called from the `context` hook (verified by temporarily removing the call)
- [x] 3.3 `bash scripts/test-release-helper.sh` and `bash scripts/test-smoke-antigravity.sh` unaffected
- [x] 3.4 `openspec validate --all` passes
- [x] 3.5 No `@earendil-works/pi-ai/compat` import or mock introduced (G1)
