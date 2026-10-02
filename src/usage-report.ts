import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";

/**
 * Pi usage kind for pruner-side LLM spend. Matches the original
 * `championswimmer/pi-context-prune` (v2.0.0, commit b06e82f) so pi-stats views
 * that already recognize those entries keep working against this fork.
 */
export const USAGE_KIND = "context_prune";

/**
 * The slice of the runtime session manager this module needs.
 *
 * `ExtensionContext.sessionManager` is typed `ReadonlySessionManager` — a
 * `Pick<>` that excludes every mutator — while the object handed to extensions
 * at runtime is the full `SessionManager`, which exposes `appendUsage` on
 * current hosts. Declared structurally and feature-detected in
 * `reportSummarizerUsage` so a host without the method reports nothing instead
 * of throwing, and so the pinned host devDependencies do not have to move.
 */
export interface UsageSession {
  getSessionId(): string;
  appendUsage?(kind: string, provider: string, model: string, usage: Usage, note?: string): unknown;
}

/**
 * Record one summarizer LLM call as a Pi `type: "usage"` session entry so the
 * host footer cost, `/session`, and pi-stats (>= 0.5.0, which reads Pi usage
 * entries directly) all see the spend exactly once. The summarizer calls the
 * provider directly, outside the agent loop, so Pi never records these calls on
 * its own.
 *
 * Called from the summarizer's `onUsage` seam, which fires as soon as the
 * provider returns a final AssistantMessage — before stopReason handling — so
 * aborted, errored, and unusable attempts that consumed tokens are billed too.
 *
 * Never throws: usage accounting is bookkeeping, and losing it must not cost the
 * user a summary. A failure is handed to `notifyError` instead.
 */
export function reportSummarizerUsage(
  session: UsageSession | undefined,
  response: AssistantMessage,
  note: string,
  notifyError: (error: unknown) => void
): void {
  const usage = response?.usage;
  if (!session || !usage) return;
  const appendUsage = session.appendUsage;
  if (typeof appendUsage !== "function") return;
  try {
    // responseModel is what actually served the request when a provider reports
    // a substitution (e.g. a `-fast` or routing variant); fall back to the
    // requested model.
    appendUsage.call(session, USAGE_KIND, response.provider, response.responseModel ?? response.model, usage, note);
  } catch (error) {
    notifyError(error);
  }
}
