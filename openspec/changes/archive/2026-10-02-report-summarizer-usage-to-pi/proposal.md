## Why

Every summary costs tokens, and none of that spend is visible in Pi.

The summarizer calls the provider directly through `ctx.modelRegistry.getProvider(...).streamSimple(...)`, bypassing the agent loop, so Pi never records those calls. What pi-condense does with the numbers today:

- `StatsAccumulator.add()` folds `usage` from **successful** results only (`index.ts:237` range fusion, `index.ts:542` batch results). An attempt that aborts, errors, or returns an unusable summary after consuming tokens is dropped entirely — the tokens were spent, and neither the widget nor the session record shows them.
- `emitExternalCost()` publishes a cumulative session delta on the `cost:external` event channel (`src/stats.ts:181`) for "an aggregator like pi-subagents" to fold in. **Nothing in the pi-extensions monorepo subscribes to that channel**, so the emission currently reaches no consumer.

The result: `/session`, Pi's footer cost, and pi-stats all under-report — pi-stats (>= 0.5.0) reads Pi's `type: "usage"` session entries directly, and this extension writes none.

The original `championswimmer/pi-context-prune` solved this in `b06e82f` (v2.0.0, 2026-09-23), simplified in `0406052` (v2.1.0): one usage entry per summarizer call, appended through the runtime session manager. This fork descends from `jjuraszek/pi-condense`, which branched before that work.

## What Changes

- Add `src/usage-report.ts`: `reportSummarizerUsage(session, response, note, notifyError)` appends one Pi usage entry per summarizer response, attributed to kind `context_prune`, preferring `responseModel` over `model` when the provider reports one.
- Add an `onUsage` seam to the summarizer options (`src/types.ts`) and fire it in `runAttempt` immediately after the provider's final response arrives — **before** `stopReason` handling — so aborted, errored, and unusable calls that consumed tokens are reported too.
- `summarizeBatch` and `summarizeRange` each supply a `usageNote` describing the call (tool-call count and turn index for a batch; range fusion for a chain summary), so a usage entry says what the spend bought.
- `index.ts` wires one callback into all three summarizer call sites. That callback both reports to Pi and folds into `StatsAccumulator`, and the two success-only `statsAccum.add(...)` calls are removed so no call is counted twice and the widget no longer disagrees with `/session`.
- The session manager capability is declared structurally and feature-detected: `ctx.sessionManager` is typed `ReadonlySessionManager`, which does not include `appendUsage`, while the runtime object is the full `SessionManager`. Hosts without it degrade to no reporting.

## Capabilities

### New Capabilities
- `usage-reporting`: summarizer LLM spend SHALL be recorded in the session as Pi usage entries, once per attempt, and SHALL agree with the extension's own stats.

### Modified Capabilities
<!-- None. `summarizer-pacing` governs rate-limit pacing and is untouched: the seam fires once per provider response, after pacing decisions are made. -->

## Impact

- **Code**: new `src/usage-report.ts` and `src/usage-report.test.ts`; `src/types.ts` (two option fields); `src/summarizer.ts` (one call plus two note strings); `index.ts` (one callback, three call sites, two removed `statsAccum.add` lines); harness plus one integration case in `src/reload-rearm.integration.test.ts`.
- **Session file**: gains `type: "usage"` entries, one per summarizer attempt. Every branch scanner in this extension filters on `type === "message"` or on specific `customType` values, so unknown entry kinds are already ignored; no reconstruction path changes.
- **Stats semantics**: `callCount` and the token/cost totals now include failed attempts that consumed tokens. This is a deliberate correction — the spend is real — and it makes the footer widget agree with `/session`.
- **Dependencies**: none added. `appendUsage` is reached through a local structural type, so the pinned host devDependencies stay at 0.83.0 and no host-version floor is introduced; a host that lacks the method simply reports nothing.
- **Not changed**: `emitExternalCost` and the `cost:external` channel stay as they are. They are cumulative-per-source and idempotent by design, and a future aggregator may still want them; removing a working emission is a separate decision.
- **Upstream divergence**: `src/summarizer.ts` and `index.ts` are hot files in upstream syncs. The seam is three lines in `runAttempt` plus option plumbing, kept adjacent to existing option handling to stay conflict-cheap.
