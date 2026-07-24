import { useCallback, useMemo, useRef, type MutableRefObject } from "react";
import type {
  ChatSessionStatus,
  LLMErrorContext,
} from "@super-client/shared-types/chat";
import { createLogger } from "../services/logService";

const log = createLogger("ChatAgent");

export type AgentRunRequestType = "agent-sdk" | "runtime" | "legacy";

export const AGENT_RUN_WATCHDOG_MS = 60_000;

type WatchdogHandle = ReturnType<typeof setTimeout>;

export interface AgentRunTimeoutContext {
  requestId: string;
}

export interface AgentRunWatchdogRefs {
  currentRequestIdRef: MutableRefObject<string | null>;
  requestTypeRef: MutableRefObject<AgentRunRequestType | null>;
  isAgentSDKRequestRef: MutableRefObject<boolean>;
  awaitingUserApprovalRef: MutableRefObject<boolean>;
  streamWatchdogRef: MutableRefObject<WatchdogHandle | null>;
}

export interface AgentRunRequestSnapshot {
  requestId: string | null;
  requestType: AgentRunRequestType | null;
  wasAgentSDKRequest: boolean;
  wasRuntimeRequest: boolean;
}

export interface AgentRunWatchdogDeps {
  getSessionStatus: () => string;
  onTimeout: (context: AgentRunTimeoutContext) => void;
  watchdogMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  warn?: (message: string, meta?: unknown) => void;
}

export function clearAgentRunWatchdog(
  refs: Pick<
    AgentRunWatchdogRefs,
    "awaitingUserApprovalRef" | "streamWatchdogRef"
  >,
  clearTimeoutFn: typeof clearTimeout = clearTimeout,
): void {
  if (refs.streamWatchdogRef.current) {
    clearTimeoutFn(refs.streamWatchdogRef.current);
    refs.streamWatchdogRef.current = null;
  }
  refs.awaitingUserApprovalRef.current = false;
}

export interface AgentRunCreateFailureDeps {
  materializeError: (summary: string, errorContext?: LLMErrorContext) => void;
  setSessionStatus: (status: ChatSessionStatus) => void;
  clearAssistantStream: () => void;
  clearCurrentRequest: () => void;
  clearWatchdog: () => void;
}

export function materializeAgentRunCreateFailure(
  summary: string,
  errorContext: LLMErrorContext | undefined,
  deps: AgentRunCreateFailureDeps,
): void {
  deps.materializeError(summary, errorContext);
  deps.setSessionStatus("idle");
  deps.clearAssistantStream();
  deps.clearCurrentRequest();
  deps.clearWatchdog();
}

export function snapshotAndClearAgentRunRequest(
  refs: Pick<
    AgentRunWatchdogRefs,
    "currentRequestIdRef" | "requestTypeRef" | "isAgentSDKRequestRef"
  >,
  clearCurrentRequest: () => void,
): AgentRunRequestSnapshot {
  const requestId = refs.currentRequestIdRef.current;
  const requestType = refs.requestTypeRef.current;
  const wasAgentSDKRequest = refs.isAgentSDKRequestRef.current;
  clearCurrentRequest();
  return {
    requestId,
    requestType,
    wasAgentSDKRequest,
    wasRuntimeRequest: requestType === "runtime",
  };
}

export function kickAgentRunWatchdog(
  refs: AgentRunWatchdogRefs,
  {
    getSessionStatus,
    onTimeout,
    watchdogMs = AGENT_RUN_WATCHDOG_MS,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    warn = (message: string, meta?: unknown) => log.warn(message, meta),
  }: AgentRunWatchdogDeps,
): void {
  if (refs.awaitingUserApprovalRef.current) return;

  if (refs.streamWatchdogRef.current) {
    clearTimeoutFn(refs.streamWatchdogRef.current);
  }

  refs.streamWatchdogRef.current = setTimeoutFn(() => {
    refs.streamWatchdogRef.current = null;

    const requestId = refs.currentRequestIdRef.current;
    if (getSessionStatus() === "idle" || !requestId) return;

    warn("stream watchdog timeout, force-resetting sessionStatus", {
      requestId,
    });
    onTimeout({ requestId });
    refs.currentRequestIdRef.current = null;
    refs.requestTypeRef.current = null;
    refs.isAgentSDKRequestRef.current = false;
  }, watchdogMs);
}

export interface UseAgentRunControllerOptions {
  getSessionStatus: () => string;
  onWatchdogTimeout: (context: AgentRunTimeoutContext) => void;
  watchdogMs?: number;
}

export function useAgentRunController({
  getSessionStatus,
  onWatchdogTimeout,
  watchdogMs = AGENT_RUN_WATCHDOG_MS,
}: UseAgentRunControllerOptions) {
  const currentRequestIdRef = useRef<string | null>(null);
  const agentSDKSessionIdRef = useRef<string | null>(null);
  const agentRuntimeSessionIdRef = useRef<string | null>(null);
  const requestTypeRef = useRef<AgentRunRequestType | null>(null);
  const isAgentSDKRequestRef = useRef(false);
  const awaitingUserApprovalRef = useRef(false);
  const streamWatchdogRef = useRef<WatchdogHandle | null>(null);

  const watchdogRefs: AgentRunWatchdogRefs = useMemo(
    () => ({
      currentRequestIdRef,
      requestTypeRef,
      isAgentSDKRequestRef,
      awaitingUserApprovalRef,
      streamWatchdogRef,
    }),
    [],
  );

  const setRequestType = useCallback((requestType: AgentRunRequestType | null) => {
    requestTypeRef.current = requestType;
    isAgentSDKRequestRef.current = requestType === "agent-sdk";
  }, []);

  const setCurrentRequestId = useCallback((requestId: string | null) => {
    currentRequestIdRef.current = requestId;
  }, []);

  const beginRequest = useCallback(
    (requestId: string, requestType: AgentRunRequestType | null) => {
      currentRequestIdRef.current = requestId;
      setRequestType(requestType);
    },
    [setRequestType],
  );

  const clearCurrentRequest = useCallback(() => {
    currentRequestIdRef.current = null;
    setRequestType(null);
  }, [setRequestType]);

  const setAgentSDKSessionId = useCallback((sessionId: string | null) => {
    agentSDKSessionIdRef.current = sessionId;
  }, []);

  const setAgentRuntimeSessionId = useCallback((sessionId: string | null) => {
    agentRuntimeSessionIdRef.current = sessionId;
  }, []);

  const setAwaitingUserApproval = useCallback((awaiting: boolean) => {
    awaitingUserApprovalRef.current = awaiting;
  }, []);

  const clearWatchdog = useCallback(() => {
    clearAgentRunWatchdog(watchdogRefs);
  }, [watchdogRefs]);

  const kickWatchdog = useCallback(() => {
    kickAgentRunWatchdog(watchdogRefs, {
      getSessionStatus,
      onTimeout: onWatchdogTimeout,
      watchdogMs,
    });
  }, [getSessionStatus, onWatchdogTimeout, watchdogMs, watchdogRefs]);

  const pauseForApproval = useCallback(() => {
    clearWatchdog();
    awaitingUserApprovalRef.current = true;
  }, [clearWatchdog]);

  const snapshotAndClearCurrentRequest = useCallback(() => {
    return snapshotAndClearAgentRunRequest(watchdogRefs, clearCurrentRequest);
  }, [clearCurrentRequest, watchdogRefs]);

  return {
    currentRequestIdRef,
    agentSDKSessionIdRef,
    agentRuntimeSessionIdRef,
    requestTypeRef,
    isAgentSDKRequestRef,
    awaitingUserApprovalRef,
    setRequestType,
    setCurrentRequestId,
    beginRequest,
    clearCurrentRequest,
    setAgentSDKSessionId,
    setAgentRuntimeSessionId,
    setAwaitingUserApproval,
    pauseForApproval,
    snapshotAndClearCurrentRequest,
    clearWatchdog,
    kickWatchdog,
    armWatchdog: kickWatchdog,
  };
}
