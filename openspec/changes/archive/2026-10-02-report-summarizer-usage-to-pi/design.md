## Context

Three ways to make summarizer spend visible existed before this change, and only one of them reaches users:

| Path | Where it lands | State before this change |
| --- | --- | --- |
| `StatsAccumulator` | footer widget, `context-prune-stats` entries | successful calls only |
| `emitExternalCost` on `cost:external` | any subscribing extension | no subscriber in the monorepo |
| Pi `type: "usage"` entries | Pi footer, `/session`, pi-stats >= 0.5.0 | not written at all |

The third is the one users actually look at, and it is the one the original `championswimmer/pi-context-prune` added in v2.0.0.

## Decisions

### 1. Feature-detect `appendUsage`; do not bump the pinned host devDependencies

`SessionManager.appendUsage(kind, provider, model, usage, note?)` exists in pi 0.99.2 (`dist/core/session-manager.d.ts:269`) but not in 0.83.0, which is what this fork pins. Bumping to 0.99.2 was tried first and rejected:

- 0.99.2 brands the provider-facing context type (`TranscriptContext` carries a `unique symbol`), so `src/summarizer.ts` would have to call `normalizeContext()` — a function that does not exist in 0.83 at all. That raises the extension's minimum host version and touches the hottest file in upstream syncs.
- Upstream `jjuraszek/pi-condense` still targets 0.83. A fork-only bump guarantees a `package.json` plus `src/summarizer.ts` conflict on every future sync, against a layered-fork model whose whole point is minimizing fork-local surface.
- Nothing in this feature needs the newer types. `AssistantMessage` in 0.83 already carries `provider`, `model`, `responseModel?`, and `usage`.

So the capability is declared structurally in `src/usage-report.ts` and checked at runtime. `ctx.sessionManager` is typed `ReadonlySessionManager` — a `Pick<>` that excludes every mutator — while the runtime object is the full `SessionManager`, so a cast is required either way; the original does the same. A host without the method reports nothing and prunes normally.

If a future change genuinely needs a 0.99-only host API, the bump should be its own change, ideally proposed upstream first.

### 2. Report before `stopReason` handling

`runAttempt` fires `onUsage` immediately after `responseStream.result()` resolves, ahead of the `aborted` throw and the `error`/`unusable` returns. Those responses consumed tokens; billing only the successes hides exactly the spend that hurts most (a stalled summarizer retried three times). This matches the original's stated rationale and is the reason the seam lives in `runAttempt` rather than at the call sites in `index.ts`, which only see successful results.

Retries are covered by the same placement: `runOnce` retries inside the rate-limit loop and `runSummarization` may retry once on the fallback model, and each attempt that produces a response reports itself.

### 3. One counting point for stats and reporting

`statsAccum.add(...)` moves into the same callback that reports to Pi, and the two success-only call sites are deleted. Keeping them separate would produce two different totals for the same session — the widget counting successes, `/session` counting attempts — and the discrepancy would look like a bug rather than a definition.

The visible consequence is that `callCount` and the token/cost totals now include failed attempts. That is the honest number: the tokens were spent whether or not the summary was usable.

### 4. The note describes what the spend bought

Pi renders the note with the usage entry, so a bare `context_prune` kind is not enough to answer "what was that call for". `summarizeBatch` supplies `summarizer call: N tool calls (turn T)`; `summarizeRange` supplies `chain range fusion`. Each public wrapper computes its own note and passes it down through options, which keeps `runAttempt` — the only place that sees the response — free of caller-specific knowledge.

### 5. Kind stays `context_prune`

The original uses `context_prune` as the usage kind, and pi-stats keys off Pi's usage entries. Matching the string keeps any pi-stats view that already recognizes the original's entries working against this fork.

### 6. Reporting never fails a prune

`appendUsage` is called inside a `try`, and a throw is routed to `notifyError` (a `safeNotify` error toast in `index.ts`). Usage accounting is bookkeeping; losing it must not cost the user a summary or leave a flush half-applied.

### 7. `cost:external` stays

The channel is cumulative-per-source and idempotent by design, so it does not double-count against the new entries, and a future aggregator (the doc comment names `pi-subagents`) may still want a push signal rather than a session scan. Removing a working emission to avoid an unused code path is a separate decision from adding this one.

## Risks

- **Session-file growth.** One extra entry per summarizer attempt. Attempts are bounded by flush frequency and `summarizerConcurrency`; entries are small (kind, provider, model, usage, note).
- **Double counting if Pi ever bills extension-side provider calls itself.** It does not today — the extension calls the provider directly, outside the agent loop. If that changes, the seam is one call site to remove.
- **Sync conflicts.** `src/summarizer.ts` and `index.ts` both change. The seam is placed next to the existing `reportTextProgress(response)` line and the option fields next to the existing `pacing` field, so an upstream hunk in either file is unlikely to overlap textually.
