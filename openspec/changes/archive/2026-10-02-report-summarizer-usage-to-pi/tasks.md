## 1. Implementation

- [x] 1.1 Add `src/usage-report.ts`: `USAGE_KIND = "context_prune"`, a structural `UsageSession` type (`getSessionId()` plus optional `appendUsage(kind, provider, model, usage, note?)`), and `reportSummarizerUsage(session, response, note, notifyError)` — no-op when the session or the method or `response.usage` is missing, `responseModel ?? model` for the model field, and a `try/catch` that routes a throw to `notifyError`
- [x] 1.2 `src/types.ts`: add `onUsage?: (response: AssistantMessage, note: string) => void` and the internal `usageNote?: string` to `SummarizeBatchOptions`, and `onUsage?` to `SummarizeBatchesOptions`
- [x] 1.3 `src/summarizer.ts` `runAttempt`: fire `options.onUsage?.(response, options.usageNote ?? "summarizer call")` immediately after `reportTextProgress(response)` and before the `aborted` throw and the `error`/`unusable` returns
- [x] 1.4 `summarizeBatch`: pass `usageNote: \`summarizer call: ${batch.toolCalls.length} tool call(s) (turn ${batch.turnIndex})\``; `summarizeRange`: pass `usageNote: "chain range fusion"`
- [x] 1.5 `summarizeBatches`: forward `onUsage` into every per-batch call, on both the single-batch delegation and the worker-pool paths
- [x] 1.6 `index.ts`: one `summarizerUsageOptions(ctx)` helper returning the `onUsage` callback that folds `response.usage` into `statsAccum` and calls `reportSummarizerUsage` with `ctx.sessionManager` cast to `UsageSession`, reporting failures through `safeNotify(..., "error")`
- [x] 1.7 `index.ts`: spread that helper into the three summarizer call sites (`makeFuseRange`'s `summarizeRange`, the sequential `summarizeBatch`, the parallel `summarizeBatches`) and delete the now-duplicated `statsAccum.add(r.usage)` / `statsAccum.add(result.usage)` lines
- [x] 1.8 Confirm the pinned host devDependencies are untouched and no `@earendil-works/pi-ai/compat` import or mock was introduced (G1)

## 2. Tests

- [x] 2.1 New `src/usage-report.test.ts`: appends with kind `context_prune`, the response's provider, `responseModel` when present and `model` when not, the usage object, and the note
- [x] 2.2 `src/usage-report.test.ts` degradation cases: session `undefined`, `appendUsage` absent, `usage` absent — each a silent no-op; `appendUsage` throwing — `notifyError` receives the error and the call does not throw
- [x] 2.3 `src/summarizer.test.ts`: `onUsage` fires for a successful response with the batch note, and also fires for a `stopReason: "error"` response and for an aborted stream before the throw propagates
- [x] 2.4 `src/summarizer.test.ts`: `summarizeRange` supplies the `chain range fusion` note
- [x] 2.5 `src/reload-rearm.integration.test.ts`: give the harness `sessionManager.appendUsage` recording into a `usageAppended` array, then assert a real flush appends one `context_prune` usage entry with non-zero tokens — proving the `index.ts` wiring end to end
- [x] 2.6 Mutation-check: remove the `onUsage` call from `runAttempt` and confirm 2.3 and 2.5 fail; restore

## 3. Gates

- [x] 3.1 `bun run typecheck` clean on the existing 0.83.0 host devDependencies
- [x] 3.2 `bun test` green (no existing stats assertion may be loosened to accommodate the new counting point; if one fails, the expectation was encoding the success-only definition and must be updated with a comment saying so)
- [x] 3.3 `bash scripts/test-release-helper.sh` and `bash scripts/test-smoke-antigravity.sh` unaffected
- [x] 3.4 `openspec validate --all` passes
- [x] 3.5 CHANGELOG `## [Unreleased]` gains a bullet covering the new usage entries and the stats-semantics correction
