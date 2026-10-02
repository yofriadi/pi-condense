## Why

In-memory state (config, tool-call index, block-ref counter, stats accumulator, prune frontier) is rebuilt **only** in the `session_start` and `session_tree` handlers (`index.ts:801`, `index.ts:855`). The `context` hook (`index.ts:1049`) reads that state unguarded.

Pi runs extension `session_start` handlers in load order. If another extension's `session_start` handler triggers an agent turn — a resume hook, a queued continuation, a startup prompt — that turn's `context` event can reach this extension before its own `session_start` has run. The consequences on a resumed session:

- `currentConfig.value` is still `{ ...DEFAULT_CONFIG }`, whose `enabled` is `false`, so the hook returns early after the image-cap guard and the whole turn ships **unpruned**.
- Even with pruning enabled, `indexer` is empty, so `pruneMessages` finds nothing to stub and the turn ships with every previously-summarized tool result expanded back to full size.
- `frontier` is empty, so the first post-race flush re-derives turn numbering from a cold baseline.

This is a silent cost failure: nothing errors, the status widget looks normal after `session_start` eventually runs, and the only evidence is a turn that cost far more than it should have.

The original `championswimmer/pi-context-prune` hit this in practice and fixed it in `0758cb1` (PR #36, 2026-09-16) with a `hydrated` flag plus an on-demand fallback in the `context` hook. This fork descends from `jjuraszek/pi-condense`, which branched before that fix and never received it.

## What Changes

- Add a `hydrated` flag and a `hydrateFromSession(ctx, loadSettings)` helper in `index.ts` that rebuilds config (optionally), the tool-call index, the block-ref counter, the stats accumulator, and the prune frontier, then sets the flag.
- Call it from `session_start` (with settings load, as today), from `session_tree` (without settings load, preserving today's behavior of keeping in-session `/pruner` overrides across tree navigation), and from the top of the `context` hook when `hydrated` is still `false` (with settings load, since nothing else has loaded them).
- No change to any handler's ordering guarantees beyond moving the in-memory `fallbackController` / `diagnostics` / `supersede` resets after `frontier.reconstructFromSession` in `session_start` and `session_tree`; those resets touch state the reconstruction does not read.

## Capabilities

### New Capabilities
- `session-hydration`: in-memory session state SHALL be available to any hook that needs it, regardless of whether this extension's `session_start` handler has run yet.

### Modified Capabilities
<!-- None. No existing repo spec (release-automation, summarizer-pacing, upstream-sync) covers session state reconstruction. -->

## Impact

- **Code**: `index.ts` only (one helper, three call sites, one flag). No `src/` module changes.
- **Behavior**: in the normal case, zero — `session_start` hydrates first and the `context` hook's fallback never fires. In the race case, the first `context` call performs one settings read and one branch scan instead of shipping an unpruned turn.
- **Cost**: one extra `loadConfig()` file read on the first `context` call, only when `session_start` has not run.
- **Compatibility**: `reconstructFromSession` is already idempotent (each implementation clears its maps before scanning), so a double hydration — fallback first, `session_start` second — is safe.
- **Dependencies**: none.
- **Tests**: new cases in `src/reload-rearm.integration.test.ts`, which already boots the extension against a synthetic branch and drives handlers directly.
