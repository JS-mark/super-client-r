/**
 * Read every part of an AI SDK `fullStream` and translate it to the legacy
 * `ChatStreamEvent` shape that the IPC + HTTP subscribers already speak.
 *
 * Note: `tool_call` / `tool_result` / `tool_error` events are emitted by
 * the tool adapter's wrapped `execute`, not here — the SDK fires its own
 * `tool-call` / `tool-result` parts but we intentionally ignore them to
 * avoid duplicate events.
 *
 * When `abortSignal` is provided and aborted, the bridge silently exits
 * without broadcasting a `done` or `error` event — matching the legacy
 * `stopStream()` behaviour where users see no toast on stop.
 *
 * Accepts either a real `StreamTextResult["fullStream"]` (async iterable)
 * or any compatible async iterable (used by tests).
 */

import type { ChatStreamEvent, ChatCompletionRequest } from "../../ipc/types";
import { buildLLMErrorContext } from "./errorContext";

/**
 * Minimal shape we need from a `streamText` `.fullStream`. We rely solely on
 * the iterator protocol + a small discriminated `type` field on each part,
 * so we don't have to thread the SDK's complex `StreamTextResult<TOOLS,
 * OUTPUT>["fullStream"]` generic into every call site.
 */
type StreamPart = { type: string; [k: string]: unknown };

export interface DrainArgs {
	requestId: string;
	broadcast: (event: ChatStreamEvent) => void;
	/** Wall-clock at the moment `streamText()` was called, for `totalMs`. */
	startTime: number;
	abortSignal?: AbortSignal;
	/**
	 * The originating request — used by the bridge to build a structured
	 * `LLMErrorContext` (preset / apiFormat / baseUrl / model + HTTP /
	 * stack + parsed provider body) when the SDK surfaces an error part
	 * or the iterator throws. Optional so tests can omit it; production
	 * callers always pass it.
	 */
	request?: ChatCompletionRequest;
}

export async function drainFullStream(
	stream: AsyncIterable<StreamPart>,
	args: DrainArgs,
): Promise<void> {
	const { requestId, broadcast, startTime, abortSignal, request } = args;
	const enrich = (err: unknown) =>
		request ? buildLLMErrorContext(err, request) : undefined;
	let firstTokenTime: number | undefined;
	let usage:
		| { inputTokens?: number; outputTokens?: number; totalTokens?: number }
		| undefined;
	let errored = false;
	let aborted = false;

	try {
		for await (const part of stream) {
			if (abortSignal?.aborted) {
				aborted = true;
				break;
			}
			if (part.type === "text-delta") {
				if (firstTokenTime === undefined) firstTokenTime = Date.now();
				const delta =
					(part as { delta?: string; text?: string }).delta ??
					(part as { text?: string }).text ??
					"";
				if (delta) broadcast({ requestId, type: "chunk", content: delta });
			} else if (part.type === "finish") {
				// AI SDK 6 emits `totalUsage` on the overall finish part (the
				// per-step finish-step parts use `usage`). Read both names so
				// the bridge survives shape drift across minor versions.
				const u =
					(part as { totalUsage?: typeof usage }).totalUsage ??
					(part as { usage?: typeof usage }).usage;
				if (u) usage = u;
			} else if (part.type === "abort") {
				aborted = true;
				break;
				} else if (part.type === "error") {
				if (abortSignal?.aborted) {
					aborted = true;
					break;
				}
				errored = true;
				const err = (part as { error?: unknown }).error;
				const errorContext = enrich(err);
				broadcast({
					requestId,
					type: "error",
					error: err instanceof Error ? err.message : String(err),
					...(errorContext ? { errorContext } : {}),
				});
			}
			// tool-call / tool-result parts: intentionally ignored — see header.
		}
	} catch (err) {
		if (abortSignal?.aborted) {
			aborted = true;
		} else {
			errored = true;
			const errorContext = enrich(err);
			broadcast({
				requestId,
				type: "error",
				error: err instanceof Error ? err.message : String(err),
				...(errorContext ? { errorContext } : {}),
			});
		}
	}

	if (errored || aborted) return;

	broadcast({
		requestId,
		type: "done",
		usage: usage
			? {
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					totalTokens: usage.totalTokens,
				}
			: undefined,
		timing: {
			firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
			totalMs: Date.now() - startTime,
		},
	});
}
