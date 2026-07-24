/**
 * useAgentRunStopper — stops an in-flight Agent run.
 *
 * Extracted from `useChat.stopCurrentStream` + its
 * `chat:stop-current-stream` DOM event bridge (Phase 0b hook slim-down).
 *
 * Behavior invariants preserved verbatim from the original inline impl:
 *   1. snapshotAndClearCurrentRequest() runs BEFORE the interrupt call so
 *      any late-arriving stream events bail at the requestId gate.
 *   2. Interrupt errors are caught — a broken interrupt path must not
 *      block the UI from resetting to idle.
 *   3. Interim streaming buffer content is committed via
 *      `updateLastMessage(sanitize(ref))` before the buffer is cleared, so
 *      the user still sees the "up to when I hit stop" text.
 *   4. `setSessionStatus("idle")` is always called.
 *   5. Any pending rAF is cancelled by `streamBuffer.clear()`.
 *   6. `persistMessages()` runs when there's an active conversation.
 */
import { useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import { sanitizeAssistantContent } from "../lib/assistantContent";
import { createLogger } from "../services/logService";
import type { AssistantStreamBufferHandle } from "./useAssistantStreamBuffer";
import type {
	AgentRunRequestSnapshot,
	AgentRunRequestType,
} from "./useAgentRunController";

const log = createLogger("ChatAgent");

export interface AgentRunStopperInterrupters {
	runtimeInterrupt: (requestId: string) => Promise<unknown>;
	agentSDKInterrupt: (requestId: string) => Promise<unknown>;
	legacyStopStream: (requestId: string) => unknown;
}

export interface AgentRunStopperMessageApi {
	updateLastMessage: (content: string) => void;
	setStreamingContent: (content: string) => void;
	setSessionStatus: (status: "idle") => void;
	persistMessages: () => void;
}

export interface AgentRunStopperRefs {
	requestTypeRef: MutableRefObject<AgentRunRequestType | null>;
	snapshotAndClearCurrentRequest: () => AgentRunRequestSnapshot;
}

export interface AgentRunStopperDeps {
	refs: AgentRunStopperRefs;
	streamBuffer: Pick<AssistantStreamBufferHandle, "getRef" | "clear">;
	interrupters: AgentRunStopperInterrupters;
	messageStoreApi: AgentRunStopperMessageApi;
	clearWatchdog: () => void;
	/** Returns the currently focused conversation id, or null when none. */
	getCurrentConversationId: () => string | null;
	logError?: (message: string, err: unknown) => void;
}

/**
 * Pure stop routine — no React, no window listener, no hidden imports.
 * The hook wires this up to `window` and to concrete singletons; tests
 * exercise this fn directly.
 */
export function stopAgentRun(deps: AgentRunStopperDeps): void {
	const {
		refs,
		streamBuffer,
		interrupters,
		messageStoreApi,
		clearWatchdog,
		getCurrentConversationId,
		logError = (msg, err) =>
			log.error(msg, err instanceof Error ? err : new Error(String(err))),
	} = deps;

	// (1) Snapshot & clear the request bookkeeping FIRST so any late stream
	//     events (arriving after this call re-enters the JS event loop) hit
	//     the `event.requestId !== currentRequestIdRef.current` bail-gate.
	const requestType = refs.requestTypeRef.current;
	const { requestId: reqId } = refs.snapshotAndClearCurrentRequest();

	// (2) Best-effort interrupt. Any thrown / rejected path must not block
	//     the UI reset below.
	if (reqId) {
		try {
			if (requestType === "runtime") {
				interrupters.runtimeInterrupt(reqId).catch((err) => {
					logError("[useChat] agent runtime interrupt failed:", err);
				});
			} else if (requestType === "agent-sdk") {
				interrupters.agentSDKInterrupt(reqId).catch((err) => {
					logError("[useChat] interruptQuery failed:", err);
				});
			} else {
				const r = interrupters.legacyStopStream(reqId) as
					| Promise<unknown>
					| undefined;
				if (r && typeof (r as Promise<unknown>).catch === "function") {
					(r as Promise<unknown>).catch((err) => {
						logError("[useChat] stopStream failed:", err);
					});
				}
			}
		} catch (err) {
			logError("[useChat] stop call threw:", err);
		}
	}

	// (3) Commit whatever text has streamed so far, then clear the buffer.
	//     Reads the buffer ref BEFORE clearing so we don't lose the tail.
	const bufferedContent = streamBuffer.getRef().current;
	if (bufferedContent) {
		messageStoreApi.updateLastMessage(
			sanitizeAssistantContent(bufferedContent),
		);
	}
	streamBuffer.clear();

	// (4) Force the store to idle even if some subscribed effect races.
	messageStoreApi.setSessionStatus("idle");
	clearWatchdog();

	// (5) Persist so a reload doesn't lose the just-committed tail.
	if (getCurrentConversationId()) {
		messageStoreApi.persistMessages();
	}
}

export interface UseAgentRunStopperOptions {
	refs: AgentRunStopperRefs;
	streamBuffer: Pick<AssistantStreamBufferHandle, "getRef" | "clear">;
	interrupters: AgentRunStopperInterrupters;
	messageStoreApi: AgentRunStopperMessageApi;
	clearWatchdog: () => void;
	getCurrentConversationId: () => string | null;
	logError?: (message: string, err: unknown) => void;
}

export interface UseAgentRunStopperHandle {
	stopCurrentStream: () => Promise<void>;
}

/**
 * React hook wrapper: installs the `chat:stop-current-stream` window
 * event listener and returns a `stopCurrentStream` callback for direct
 * invocation from the composer / hotkey path.
 */
export function useAgentRunStopper(
	options: UseAgentRunStopperOptions,
): UseAgentRunStopperHandle {
	const {
		refs,
		streamBuffer,
		interrupters,
		messageStoreApi,
		clearWatchdog,
		getCurrentConversationId,
		logError,
	} = options;

	const stopCurrentStream = useCallback(async (): Promise<void> => {
		stopAgentRun({
			refs,
			streamBuffer,
			interrupters,
			messageStoreApi,
			clearWatchdog,
			getCurrentConversationId,
			logError,
		});
	}, [
		refs,
		streamBuffer,
		interrupters,
		messageStoreApi,
		clearWatchdog,
		getCurrentConversationId,
		logError,
	]);

	useEffect(() => {
		const listener = (): void => {
			void stopCurrentStream();
		};
		window.addEventListener("chat:stop-current-stream", listener);
		return () => {
			window.removeEventListener("chat:stop-current-stream", listener);
		};
	}, [stopCurrentStream]);

	return { stopCurrentStream };
}
