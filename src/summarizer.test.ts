import { describe, it, expect } from "bun:test";
import { isUsableSummary, summarizeBatch, summarizeRange, summarizerThinkingOptions } from "./summarizer.js";
import { DEFAULT_CONFIG } from "./types.js";

describe("isUsableSummary", () => {
  it("accepts non-empty text that stopped normally", () => {
    expect(isUsableSummary("- did a thing", "stop")).toBe(true);
  });
  it("rejects empty text", () => {
    expect(isUsableSummary("", "stop")).toBe(false);
  });
  it("rejects whitespace-only text", () => {
    expect(isUsableSummary("   \n\t ", "stop")).toBe(false);
  });
  it("rejects truncated output even with text", () => {
    expect(isUsableSummary("- partial", "length")).toBe(false);
  });
});

describe("summarizer prompt", () => {
  it("tells the model that an image marker is an image it cannot see", async () => {
    const model = { id: "m", provider: "p", name: "M" };
    let seenInput: unknown;
    const ctx = {
      model,
      modelRegistry: {
        find: () => model,
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k", headers: {} }),
        getProviderAuth: async () => undefined,
        getProvider: () => ({
          streamSimple: (_model: unknown, input: unknown) => {
            seenInput = input;
            return {
              async *[Symbol.asyncIterator]() {},
              async result() {
                return {
                  stopReason: "stop",
                  content: [{ type: "text", text: "- summary" }],
                  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                };
              },
            };
          },
        }),
      },
      ui: { notify() {} },
    } as any;
    const batch = {
      turnIndex: 0,
      timestamp: 0,
      assistantText: "",
      toolCalls: [{ toolCallId: "a", toolName: "read", args: {}, resultText: "[image returned: image/png sha256:3f9a2c1e]\nRead image file [image/png]", isError: false }],
    } as any;
    await summarizeBatch(batch, DEFAULT_CONFIG, ctx);
    expect(JSON.stringify(seenInput)).toContain("means the tool returned an image you cannot see");
  });
});

describe("summarizerThinkingOptions", () => {
  it("uses provider-neutral reasoning only when the model supports it", () => {
    expect(summarizerThinkingOptions({ ...DEFAULT_CONFIG, summarizerThinking: "high" }, { reasoning: true })).toEqual({
      reasoning: "high",
    });
    expect(summarizerThinkingOptions({ ...DEFAULT_CONFIG, summarizerThinking: "off" }, { reasoning: true })).toEqual({});
    expect(summarizerThinkingOptions({ ...DEFAULT_CONFIG, summarizerThinking: "high" }, { reasoning: false })).toEqual({});
  });
});

describe("summarizer onUsage seam", () => {
  const usage = {
    input: 10,
    output: 5,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 15,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };

  // A provider whose single response is scripted, so the seam can be observed on
  // the success path and on the two failure paths that still spent tokens.
  function ctxReturning(response: Record<string, unknown>) {
    const model = { id: "m", provider: "p", name: "M" };
    return {
      model,
      modelRegistry: {
        find: () => model,
        getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k", headers: {} }),
        getProviderAuth: async () => undefined,
        getProvider: () => ({
          streamSimple: () => ({
            async *[Symbol.asyncIterator]() {},
            async result() {
              return response;
            },
          }),
        }),
      },
      ui: { notify() {} },
    } as any;
  }

  const batch = {
    turnIndex: 4,
    timestamp: 0,
    assistantText: "",
    toolCalls: [
      { toolCallId: "a", toolName: "read", args: {}, resultText: "one", isError: false },
      { toolCallId: "b", toolName: "bash", args: {}, resultText: "two", isError: false },
    ],
  } as any;

  it("fires once with the batch note on success", async () => {
    const seen: Array<{ note: string; usage: unknown }> = [];

    const res = await summarizeBatch(batch, DEFAULT_CONFIG, ctxReturning({ stopReason: "stop", content: [{ type: "text", text: "- summary" }], usage }), {
      onUsage: (response, note) => seen.push({ note, usage: response.usage }),
    });

    expect(res?.summaryText).toBe("- summary");
    expect(seen).toEqual([{ note: "summarizer call: 2 tool calls (turn 4)", usage }]);
  });

  it("singularizes the note for a one-tool-call batch", async () => {
    const notes: string[] = [];
    const single = { ...batch, toolCalls: batch.toolCalls.slice(0, 1) };

    await summarizeBatch(single, DEFAULT_CONFIG, ctxReturning({ stopReason: "stop", content: [{ type: "text", text: "- s" }], usage }), {
      onUsage: (_response, note) => notes.push(note),
    });

    expect(notes).toEqual(["summarizer call: 1 tool call (turn 4)"]);
  });

  it("bills an errored response before it is classified as a failure", async () => {
    const notes: string[] = [];

    const res = await summarizeBatch(batch, DEFAULT_CONFIG, ctxReturning({ stopReason: "error", errorMessage: "boom", content: [], usage }), {
      onUsage: (_response, note) => notes.push(note),
    });

    // Reported, and the outcome is still a failure: billing changes nothing.
    expect(notes).toHaveLength(1);
    expect(res).toBeNull();
  });

  it("bills an aborted response before the abort is handled", async () => {
    const notes: string[] = [];

    const res = await summarizeBatch(batch, DEFAULT_CONFIG, ctxReturning({ stopReason: "aborted", content: [], usage }), {
      onUsage: (_response, note) => notes.push(note),
    });

    expect(notes).toHaveLength(1);
    expect(res).toBeNull();
  });

  it("does not fire when the response carries no usage", async () => {
    let fired = 0;

    await summarizeBatch(batch, DEFAULT_CONFIG, ctxReturning({ stopReason: "stop", content: [{ type: "text", text: "- s" }] }), {
      onUsage: () => {
        fired += 1;
      },
    });

    expect(fired).toBe(0);
  });

  it("labels a range fusion call", async () => {
    const notes: string[] = [];

    await summarizeRange("- earlier summary", DEFAULT_CONFIG, ctxReturning({ stopReason: "stop", content: [{ type: "text", text: "- fused" }], usage }), {
      onUsage: (_response, note) => notes.push(note),
    });

    expect(notes).toEqual(["chain range fusion"]);
  });
});
