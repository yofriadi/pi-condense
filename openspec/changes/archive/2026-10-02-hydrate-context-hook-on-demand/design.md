## Context

`index.ts` keeps five pieces of session-derived state in closure variables: `currentConfig`, `indexer`, `blockRefs`, `statsAccum`, and `frontier`. All five are rebuilt in `session_start`; four of them (not config) are rebuilt again in `session_tree`. The `context` hook consumes `currentConfig` (image cap, `enabled`, protection settings, chain-compression and error-purge config) and `indexer`/`frontier` (through `pruneMessages`), but assumes both handlers have already run.

Pi's extension host calls `session_start` handlers in registration order and does not await one extension's handler before dispatching events to the next. Any extension that starts work from its own `session_start` — a resume helper, an auto-continue, a queued prompt replay — can therefore produce an agent turn whose `context` event reaches this extension first.

## Decisions

### 1. Hydrate in the `context` hook rather than at extension init

Extension init (`export default function (pi)`) has no `ctx`, so it cannot read the session branch, and it runs before any session exists. The `context` hook is the earliest point that has both a `ctx` and a concrete need for the state. This matches the original's fix (`0758cb1`).

### 2. Load settings in the fallback, not only the index

The original's `hydrateFromSession` reconstructs index, stats, and frontier but leaves config alone, because its `context` hook returns early on `!currentConfig.value.enabled` before reaching the fallback. That is only safe when the in-memory default enables pruning. Our `DEFAULT_CONFIG.enabled` is `false`, so a config-less fallback would still ship the raced turn unpruned — the flag would clear the crash but not the bug. The fallback therefore loads settings too.

`loadSettings` is a parameter rather than unconditional because `session_tree` must not reload: a user who ran `/pruner on` mid-session would silently lose that override on tree navigation.

### 3. One helper, three call sites

Duplicating the four reconstruction calls into the `context` hook would leave two copies to keep in sync, and the next piece of session-derived state added to `session_start` would miss the fallback. Routing all three handlers through `hydrateFromSession` makes the fallback structurally equal to the real path.

The cost is a reordering inside `session_start` and `session_tree`: `fallbackController.reset()`, `diagnostics.reset()`, `supersede.activated.clear()`, and `supersede.floor = 0` currently sit between the stats and frontier reconstructions and now run after all of them. None of those four reads or writes anything the reconstructions touch — they clear in-memory counters and sets that the reconstructions never populate — so the reordering is inert. Task 1.5 checks this rather than assuming it.

### 4. `hydrated` is a flag, not a per-session key

Only one session is active per extension instance, and both `session_start` and `session_tree` unconditionally re-hydrate, so a boolean is sufficient. Keying it by session id would add state that nothing reads.

### 5. Not extended to `turn_end` or `message_end`

The race produces a turn; that turn's `context` event always precedes its `turn_end`. Hydrating in `context` therefore covers the raced turn, and `capturePendingBatches` re-scans the session branch on its own, so a cold `frontier` self-corrects at the first flush. Adding the same guard to the flush handlers would widen the surface without a scenario that needs it.

## Risks

- **Extra I/O on the hot path.** One `loadConfig()` file read, and only when the fallback fires. The normal path pays nothing.
- **Double hydration.** `session_start` after a fallback hydration re-runs every `reconstructFromSession`, each of which clears its own maps first. Already the behavior between `session_start` and `session_tree` today.
- **Behavioral surprise if the fallback fires mid-session.** It cannot: `hydrated` is true after any `session_start`, which always runs before the first turn of a session that Pi started normally.
