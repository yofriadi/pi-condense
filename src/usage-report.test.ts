import { describe, it, expect } from "bun:test";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { reportSummarizerUsage, USAGE_KIND, type UsageSession } from "./usage-report.js";

function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return {
    input: 100,
    output: 20,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 120,
    cost: { input: 0.001, output: 0.0004, cacheRead: 0, cacheWrite: 0, total: 0.0014 },
    ...overrides,
  };
}

function makeResponse(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: "- summary" }],
    api: "test-api",
    provider: "test-provider",
    model: "requested-model",
    usage: makeUsage(),
    stopReason: "stop",
    timestamp: 0,
    ...overrides,
  };
}

interface Recorded {
  kind: string;
  provider: string;
  model: string;
  usage: Usage;
  note: string | undefined;
  /** Read through `this`, so a lost receiver binding shows up as a missing call. */
  sessionId: string;
}

/**
 * A class rather than an object literal so `appendUsage` depends on its
 * receiver: reportSummarizerUsage must invoke it bound to the session.
 */
class RecordingSession implements UsageSession {
  calls: Recorded[] = [];
  behavior: "append" | "throw";

  constructor(behavior: "append" | "throw" = "append") {
    this.behavior = behavior;
  }

  getSessionId(): string {
    return "session-1";
  }

  appendUsage(kind: string, provider: string, model: string, usage: Usage, note?: string): { id: string } {
    if (this.behavior === "throw") throw new Error("session file went away");
    this.calls.push({ kind, provider, model, usage, note, sessionId: this.getSessionId() });
    return { id: "entry-1" };
  }
}

const failIfCalled = () => {
  throw new Error("notifyError must not be called");
};

describe("reportSummarizerUsage", () => {
  it("records one Pi usage entry per response, attributed to the context_prune kind", () => {
    const session = new RecordingSession();
    const usage = makeUsage({ input: 7 });

    reportSummarizerUsage(session, makeResponse({ usage }), "summarizer call: 2 tool calls (turn 4)", failIfCalled);

    expect(session.calls).toHaveLength(1);
    expect(session.calls[0]).toEqual({
      kind: USAGE_KIND,
      provider: "test-provider",
      model: "requested-model",
      usage,
      note: "summarizer call: 2 tool calls (turn 4)",
      sessionId: "session-1",
    });
  });

  it("attributes the spend to responseModel when the provider reports a substitution", () => {
    const session = new RecordingSession();

    reportSummarizerUsage(session, makeResponse({ responseModel: "served-model" }), "note", failIfCalled);

    expect(session.calls[0].model).toBe("served-model");
  });

  it("is a silent no-op when there is no session", () => {
    expect(() => reportSummarizerUsage(undefined, makeResponse(), "note", failIfCalled)).not.toThrow();
  });

  it("is a silent no-op when the host session manager has no appendUsage", () => {
    // Pi types ctx.sessionManager as ReadonlySessionManager; an older host may
    // not carry the mutator at runtime either.
    const session: UsageSession = { getSessionId: () => "session-1" };

    expect(() => reportSummarizerUsage(session, makeResponse(), "note", failIfCalled)).not.toThrow();
  });

  it("is a silent no-op when the response carries no usage", () => {
    const session = new RecordingSession();

    reportSummarizerUsage(session, makeResponse({ usage: undefined as unknown as Usage }), "note", failIfCalled);

    expect(session.calls).toHaveLength(0);
  });

  it("routes a reporting failure to notifyError instead of throwing", () => {
    const session = new RecordingSession("throw");
    const seen: unknown[] = [];

    expect(() => reportSummarizerUsage(session, makeResponse(), "note", (error) => seen.push(error))).not.toThrow();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(Error);
    expect((seen[0] as Error).message).toBe("session file went away");
  });
});
