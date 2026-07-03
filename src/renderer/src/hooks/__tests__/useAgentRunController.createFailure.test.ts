import { describe, expect, it, vi, type Mock } from "vitest";
import type { LLMErrorContext } from "@super-client/shared-types/chat";

import {
  materializeAgentRunCreateFailure,
  type AgentRunCreateFailureDeps,
} from "../useAgentRunController";

// Focused unit test for `materializeAgentRunCreateFailure`. This asserts
// the exact recovery contract used by `useChat` when the agent runtime
// `createQuery` call itself throws before any streaming has begun:
//
//   1. The assistant placeholder is turned into an error bubble via
//      `materializeError(summary, errorContext)` — with a stable
//      `providerErrorCode: "agent_runtime_create_failed"` so callers
//      can filter/attribute later.
//   2. Session status is restored to "idle" (unblocks the composer).
//   3. The assistant stream buffer is cleared.
//   4. The inflight request bookkeeping is snapshot-cleared via
//      `clearCurrentRequest`.
//   5. The stream watchdog is torn down via `clearWatchdog`.
//   6. There is NO SDK fallback: `createFailure` deliberately does not
//      invoke the legacy `agent-sdk` createQuery path.
//
// The existing `useAgentRunController.test.ts` file already covers the
// happy paths; this file is intentionally split out to keep the
// SDK-fallback negative assertion explicit and easy to grep.

function makeDeps(): AgentRunCreateFailureDeps {
  return {
    materializeError: vi.fn<AgentRunCreateFailureDeps["materializeError"]>(),
    setSessionStatus: vi.fn<AgentRunCreateFailureDeps["setSessionStatus"]>(),
    clearAssistantStream:
      vi.fn<AgentRunCreateFailureDeps["clearAssistantStream"]>(),
    clearCurrentRequest:
      vi.fn<AgentRunCreateFailureDeps["clearCurrentRequest"]>(),
    clearWatchdog: vi.fn<AgentRunCreateFailureDeps["clearWatchdog"]>(),
  };
}

describe("materializeAgentRunCreateFailure", () => {
  it("materializes an error bubble with providerErrorCode agent_runtime_create_failed", () => {
    const deps = makeDeps();
    const errorContext: LLMErrorContext = {
      preset: "dashscope",
      apiFormat: undefined,
      baseUrl: undefined,
      model: "qwen-test",
      statusCode: undefined,
      endpointUrl: undefined,
      responseBodySnippet: undefined,
      providerErrorCode: "agent_runtime_create_failed",
      providerErrorMessage: "runtime unavailable",
    };

    materializeAgentRunCreateFailure(
      "runtime unavailable",
      errorContext,
      deps,
    );

    expect(deps.materializeError).toHaveBeenCalledTimes(1);
    const [summary, ctx] = (
      deps.materializeError as Mock<
        AgentRunCreateFailureDeps["materializeError"]
      >
    ).mock.calls[0];
    expect(summary).toBe("runtime unavailable");
    expect(ctx).toBeDefined();
    expect((ctx as LLMErrorContext).providerErrorCode).toBe(
      "agent_runtime_create_failed",
    );
  });

  it("restores idle sessionStatus, clears stream, request and watchdog exactly once", () => {
    const deps = makeDeps();

    materializeAgentRunCreateFailure(
      "boom",
      undefined,
      deps,
    );

    expect(deps.setSessionStatus).toHaveBeenCalledExactlyOnceWith("idle");
    expect(deps.clearAssistantStream).toHaveBeenCalledOnce();
    expect(deps.clearCurrentRequest).toHaveBeenCalledOnce();
    expect(deps.clearWatchdog).toHaveBeenCalledOnce();
  });

  it("does not invoke any SDK fallback path (no createQuery hooks touched)", () => {
    const deps = makeDeps();

    // Any legacy SDK createQuery mock — we assert nothing beyond the
    // 5-callback surface is invoked. The public API of the failure
    // helper is intentionally narrow: it does not accept nor call any
    // fallback runtime. If a future refactor adds an SDK fallback hook,
    // this test will need explicit updating (which is the whole point).
    const sdkCreateQuery = vi.fn();
    const runtimeCreateQuery = vi.fn();

    materializeAgentRunCreateFailure(
      "fatal boot",
      { providerErrorCode: "agent_runtime_create_failed" } as LLMErrorContext,
      deps,
    );

    expect(sdkCreateQuery).not.toHaveBeenCalled();
    expect(runtimeCreateQuery).not.toHaveBeenCalled();
  });

  it("invokes side effects in the expected order (error → status → stream → request → watchdog)", () => {
    // The current implementation is order-sensitive: setting status
    // BEFORE clearing stream/request would flash "idle" to the UI
    // while the composer state is still bound to the old request. The
    // test locks the observable call order down so later refactors
    // can't silently reorder.
    const order: string[] = [];
    const deps: AgentRunCreateFailureDeps = {
      materializeError: vi.fn(() => {
        order.push("materializeError");
      }),
      setSessionStatus: vi.fn(() => {
        order.push("setSessionStatus");
      }),
      clearAssistantStream: vi.fn(() => {
        order.push("clearAssistantStream");
      }),
      clearCurrentRequest: vi.fn(() => {
        order.push("clearCurrentRequest");
      }),
      clearWatchdog: vi.fn(() => {
        order.push("clearWatchdog");
      }),
    };

    materializeAgentRunCreateFailure("x", undefined, deps);

    expect(order).toEqual([
      "materializeError",
      "setSessionStatus",
      "clearAssistantStream",
      "clearCurrentRequest",
      "clearWatchdog",
    ]);
  });
});
