import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutableRefObject } from "react";
import {
  clearAgentRunWatchdog,
  kickAgentRunWatchdog,
  materializeAgentRunCreateFailure,
  snapshotAndClearAgentRunRequest,
  type AgentRunWatchdogRefs,
} from "../useAgentRunController";

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

function createRefs(): AgentRunWatchdogRefs {
  return {
    currentRequestIdRef: ref("req_1"),
    requestTypeRef: ref("agent-sdk"),
    isAgentSDKRequestRef: ref(true),
    awaitingUserApprovalRef: ref(false),
    streamWatchdogRef: ref<ReturnType<typeof setTimeout> | null>(null),
  };
}

describe("agent run watchdog helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("times out an active request and clears request bookkeeping", () => {
    const refs = createRefs();
    const onTimeout = vi.fn();
    const warn = vi.fn();

    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "streaming",
      onTimeout,
      watchdogMs: 100,
      warn,
    });

    vi.advanceTimersByTime(100);

    expect(onTimeout).toHaveBeenCalledWith({ requestId: "req_1" });
    expect(warn).toHaveBeenCalledWith(
      "[useChat] stream watchdog timeout, force-resetting sessionStatus",
      { requestId: "req_1" },
    );
    expect(refs.currentRequestIdRef.current).toBeNull();
    expect(refs.requestTypeRef.current).toBeNull();
    expect(refs.isAgentSDKRequestRef.current).toBe(false);
    expect(refs.streamWatchdogRef.current).toBeNull();
  });

  it("does not arm while awaiting user approval", () => {
    const refs = createRefs();
    refs.awaitingUserApprovalRef.current = true;
    const onTimeout = vi.fn();

    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "streaming",
      onTimeout,
      watchdogMs: 100,
    });
    vi.advanceTimersByTime(100);

    expect(refs.streamWatchdogRef.current).toBeNull();
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("resumes the watchdog after an approval pause is cleared", () => {
    const refs = createRefs();
    refs.awaitingUserApprovalRef.current = true;
    const onTimeout = vi.fn();

    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "tool_calling",
      onTimeout,
      watchdogMs: 100,
    });

    expect(refs.streamWatchdogRef.current).toBeNull();

    refs.awaitingUserApprovalRef.current = false;
    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "streaming",
      onTimeout,
      watchdogMs: 100,
    });
    vi.advanceTimersByTime(100);

    expect(onTimeout).toHaveBeenCalledWith({ requestId: "req_1" });
  });

  it("clears the timer and approval pause state", () => {
    const refs = createRefs();
    const onTimeout = vi.fn();

    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "streaming",
      onTimeout,
      watchdogMs: 100,
    });
    refs.awaitingUserApprovalRef.current = true;

    clearAgentRunWatchdog(refs);
    vi.advanceTimersByTime(100);

    expect(refs.streamWatchdogRef.current).toBeNull();
    expect(refs.awaitingUserApprovalRef.current).toBe(false);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("keeps approval pause active when clearing an old watchdog for approval", () => {
    const refs = createRefs();
    const onTimeout = vi.fn();

    kickAgentRunWatchdog(refs, {
      getSessionStatus: () => "streaming",
      onTimeout,
      watchdogMs: 100,
    });

    clearAgentRunWatchdog(refs);
    refs.awaitingUserApprovalRef.current = true;
    vi.advanceTimersByTime(100);

    expect(refs.streamWatchdogRef.current).toBeNull();
    expect(refs.awaitingUserApprovalRef.current).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
  });


  it("materializes create failures and restores idle request state", () => {
    const deps = {
      materializeError: vi.fn(),
      setSessionStatus: vi.fn(),
      clearAssistantStream: vi.fn(),
      clearCurrentRequest: vi.fn(),
      clearWatchdog: vi.fn(),
    };
    const errorContext = {
      model: "qwen-test",
      preset: "dashscope",
      apiFormat: undefined,
      baseUrl: undefined,
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

    expect(deps.materializeError).toHaveBeenCalledWith(
      "runtime unavailable",
      errorContext,
    );
    expect(deps.setSessionStatus).toHaveBeenCalledWith("idle");
    expect(deps.clearAssistantStream).toHaveBeenCalledOnce();
    expect(deps.clearCurrentRequest).toHaveBeenCalledOnce();
    expect(deps.clearWatchdog).toHaveBeenCalledOnce();
  });

  it("snapshots runtime requests before clearing stop bookkeeping", () => {
    const refs = createRefs();
    refs.requestTypeRef.current = "runtime";
    refs.isAgentSDKRequestRef.current = false;
    const clearCurrentRequest = vi.fn(() => {
      refs.currentRequestIdRef.current = null;
      refs.requestTypeRef.current = null;
      refs.isAgentSDKRequestRef.current = false;
    });

    expect(snapshotAndClearAgentRunRequest(refs, clearCurrentRequest)).toEqual({
      requestId: "req_1",
      requestType: "runtime",
      wasAgentSDKRequest: false,
      wasRuntimeRequest: true,
    });
    expect(clearCurrentRequest).toHaveBeenCalledOnce();
    expect(refs.currentRequestIdRef.current).toBeNull();
    expect(refs.requestTypeRef.current).toBeNull();
    expect(refs.isAgentSDKRequestRef.current).toBe(false);
  });
});
