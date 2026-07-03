/**
 * agentRunError — pure helpers for materialising an `ErrorCard` on the
 * in-flight assistant bubble.
 *
 * Extracted from `useChat.materializeStreamError` (Phase 0b hook slim-down).
 * No React, no store references — the caller passes in the current message
 * list and the resolved model info, and gets back:
 *  - a `markMessageAsError` payload (or `null` when the error should be
 *    routed to a toast because there's nothing to attach it to)
 *  - a `reason` tag so the caller can decide whether to still show a toast
 *
 * Invariant preserved verbatim from the original inline implementation:
 * a *weaker* follow-up error must not overwrite a *richer* prior error
 * for the same assistant bubble. Richness is scored by whether the error
 * carries `statusCode`, `responseBodySnippet` and `stack` — the same
 * signals the original code inspected.
 */
import type { LLMErrorContext, Message } from "@super-client/shared-types/chat";

export type MaterializeErrorReason =
	/** No assistant bubble available — caller should fall back to a toast. */
	| "prestream"
	/** In-flight assistant bubble converted into an error. */
	| "midstream"
	/** Prior error was richer — no overwrite. Caller should drop the update. */
	| "postcomplete";

export interface AgentRunErrorModelInfo {
	model?: string;
	providerPreset?: string;
	providerName?: string;
	apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
	// Passthrough source fields; unused by merge but accepted for symmetry.
	modelSource?: string;
	modelSourceLabel?: string;
}

export interface MaterializeStreamErrorInput {
	messages: Message[];
	summary: string;
	errorContext?: Partial<LLMErrorContext>;
	modelInfo?: AgentRunErrorModelInfo | null;
}

export interface MaterializeStreamErrorPatch {
	messageId: string;
	patch: {
		summary: string;
		errorContext: LLMErrorContext;
		query?: string;
	};
}

export interface MaterializeStreamErrorResult {
	reason: MaterializeErrorReason;
	patch: MaterializeStreamErrorPatch | null;
}

/**
 * Score how "rich" an errorContext is. Richer contexts (with statusCode,
 * response body, or JS stack) beat leaner ones. Used to avoid a broker
 * fallback message clobbering a fully-populated translator error.
 */
export function computeErrorRichness(
	ctx: Partial<LLMErrorContext> | undefined | null,
): number {
	if (!ctx) return 0;
	let score = 0;
	if (ctx.statusCode !== undefined) score += 1;
	if (ctx.responseBodySnippet) score += 1;
	if (ctx.stack) score += 1;
	return score;
}

/**
 * Merge an incoming (possibly partial) errorContext with model info known
 * locally at the time of the error. Never returns undefined fields — falls
 * back to `undefined` explicitly to match the canonical `LLMErrorContext`
 * shape produced by `buildLLMErrorContext` in the main process.
 */
export function buildMergedErrorContext(
	incoming: Partial<LLMErrorContext> | undefined,
	modelInfo?: AgentRunErrorModelInfo | null,
): LLMErrorContext {
	return {
		preset: incoming?.preset ?? modelInfo?.providerPreset,
		apiFormat: incoming?.apiFormat ?? modelInfo?.apiFormat,
		baseUrl: incoming?.baseUrl,
		model: incoming?.model ?? modelInfo?.model,
		statusCode: incoming?.statusCode,
		endpointUrl: incoming?.endpointUrl,
		responseBodySnippet: incoming?.responseBodySnippet,
		providerErrorCode: incoming?.providerErrorCode,
		providerErrorMessage: incoming?.providerErrorMessage,
		...(incoming?.stack ? { stack: incoming.stack } : {}),
	};
}

/**
 * Compute the message-store patch (or a `reason: "prestream"` signal that
 * no bubble is available). Callers apply the patch via `markMessageAsError`
 * and, on `"prestream"`, may fall back to a toast.
 */
export function materializeStreamErrorPatch(
	input: MaterializeStreamErrorInput,
): MaterializeStreamErrorResult {
	const { messages, summary, errorContext, modelInfo } = input;

	const lastAssistant = [...messages]
		.reverse()
		.find((m) => m.role === "assistant");

	if (!lastAssistant) {
		return { reason: "prestream", patch: null };
	}

	const incomingRichness = computeErrorRichness(errorContext);
	const existingRichness = computeErrorRichness(
		lastAssistant.metadata?.errorContext,
	);
	if (
		lastAssistant.type === "error" &&
		existingRichness >= incomingRichness
	) {
		return { reason: "postcomplete", patch: null };
	}

	const triggeringUser = [...messages]
		.slice(
			0,
			messages.findIndex((m) => m.id === lastAssistant.id),
		)
		.reverse()
		.find((m) => m.role === "user");

	const mergedContext = buildMergedErrorContext(errorContext, modelInfo);

	return {
		reason: "midstream",
		patch: {
			messageId: lastAssistant.id,
			patch: {
				summary,
				errorContext: mergedContext,
				...(triggeringUser?.content
					? { query: triggeringUser.content }
					: {}),
			},
		},
	};
}
