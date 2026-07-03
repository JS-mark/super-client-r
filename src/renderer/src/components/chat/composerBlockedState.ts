import type { Message } from "@super-client/shared-types/chat";

/**
 * Descriptor for the paused-error composer branch. When the newest assistant
 * message failed to start the agent runtime (or otherwise carries a paused
 * providerErrorCode), the composer swaps the ordinary input for a small
 * recovery affordance surfaced from this state.
 *
 * We intentionally derive this on the render side only — the recovery UI
 * clears local state and refocuses the composer; wiring to actual retry can
 * be layered later without touching `useChat`.
 */
export interface ComposerPausedErrorState {
	messageId: string;
	summary?: string;
	providerErrorCode?: string;
	providerErrorMessage?: string;
}

/**
 * Providers/paths that surface a "paused runtime" error surface. Currently
 * `agent_runtime_create_failed` is the only stable code the renderer knows
 * about; keep the list explicit so future additions have to be considered.
 */
const PAUSED_ERROR_CODES: ReadonlySet<string> = new Set([
	"agent_runtime_create_failed",
]);

/**
 * Return the paused-error descriptor when the latest assistant message
 * carries a known "paused" providerErrorCode. Returns `undefined` when the
 * composer should render normally.
 */
export function derivePausedErrorState(
	messages: Message[],
): ComposerPausedErrorState | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const msg = messages[i];
		if (!msg || msg.role !== "assistant") continue;
		const code = msg.metadata?.errorContext?.providerErrorCode;
		if (!code || !PAUSED_ERROR_CODES.has(code)) return undefined;
		return {
			messageId: msg.id,
			summary: msg.metadata?.errorSummary,
			providerErrorCode: code,
			providerErrorMessage:
				msg.metadata?.errorContext?.providerErrorMessage ?? undefined,
		};
	}
	return undefined;
}
