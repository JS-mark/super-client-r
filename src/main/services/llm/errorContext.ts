/**
 * formatLLMError — augment provider errors with the request context that
 * caused them.
 *
 * Why this exists: when the AI SDK reports `APICallError: Not Found`, the
 * user-facing message gives no hint of which provider / model / wire-format /
 * baseUrl was in play. Most "Not Found" failures are config mismatches
 * (e.g. apiFormat=anthropic-messages on a baseUrl that's only valid for
 * chat-completions), so surfacing the (preset, apiFormat, baseUrl, model)
 * tuple together with the HTTP status turns a head-scratch into an obvious
 * "oh, wrong URL/model" diagnosis.
 *
 * The helper is intentionally lossy on non-string fields — the returned
 * string is for human reading (broadcast to renderer + dev log). The
 * structured object is returned alongside for `log.error(..., ctx)` calls.
 */

import type { LLMErrorContext } from "@super-client/shared-types/chat";
import type { ChatCompletionRequest } from "../../ipc/types";

// LLMErrorContext now lives in shared-types so the renderer, preload bridge,
// and main process all import the same canonical shape. Re-export here so
// existing call sites that imported it from this module keep working.
export type { LLMErrorContext } from "@super-client/shared-types/chat";

interface AiSdkApiError {
	statusCode?: number;
	url?: string;
	responseBody?: string | null;
	message?: string;
}

function asAiSdkApiError(err: unknown): AiSdkApiError | null {
	if (!err || typeof err !== "object") return null;
	const e = err as Record<string, unknown>;
	const looksLikeApiError =
		typeof e.statusCode === "number" ||
		typeof e.url === "string" ||
		typeof e.responseBody === "string";
	return looksLikeApiError ? (e as AiSdkApiError) : null;
}

function snippet(s: string | undefined | null, max = 300): string | undefined {
	if (!s) return undefined;
	const trimmed = s.trim();
	if (!trimmed) return undefined;
	return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Try to extract `{code, message}` from a provider's response body. Handles:
 *   1. SSE error frame (Bailian / DashScope style):
 *        event:error
 *        data:{"code":"...","message":"...","request_id":"..."}
 *   2. Plain JSON error body (most OpenAI-compat providers):
 *        {"error":{"code":"...","message":"..."}}
 *        or {"code":"...","message":"..."}
 * Returns `null` when neither shape matches — safe to ignore.
 */
export function parseProviderErrorBody(
	body: string | undefined | null,
): { code?: string; message?: string } | null {
	if (!body) return null;
	const trimmed = body.trim();
	if (!trimmed) return null;
	// SSE frame: pick the `data:` line containing JSON.
	if (trimmed.startsWith("event:") || trimmed.includes("\ndata:")) {
		const dataLine = trimmed
			.split("\n")
			.map((l) => l.trim())
			.find((l) => l.startsWith("data:"));
		if (dataLine) {
			const json = dataLine.slice("data:".length).trim();
			const parsed = tryJsonError(json);
			if (parsed) return parsed;
		}
	}
	// Plain JSON body.
	return tryJsonError(trimmed);
}

function tryJsonError(
	raw: string,
): { code?: string; message?: string } | null {
	try {
		const obj = JSON.parse(raw) as Record<string, unknown>;
		const inner =
			obj.error && typeof obj.error === "object"
				? (obj.error as Record<string, unknown>)
				: obj;
		const code =
			typeof inner.code === "string"
				? inner.code
				: typeof inner.type === "string"
					? inner.type
					: undefined;
		const message =
			typeof inner.message === "string" ? inner.message : undefined;
		if (!code && !message) return null;
		return { code, message };
	} catch {
		return null;
	}
}

/**
 * Build a structured context object describing the failed call. Safe to log
 * (no API key exposure). Use `formatLLMErrorMessage` for a single-line
 * human-readable error string.
 */
export function buildLLMErrorContext(
	err: unknown,
	request: Pick<
		ChatCompletionRequest,
		"providerPreset" | "apiFormat" | "baseUrl" | "model"
	>,
): LLMErrorContext {
	const apiErr = asAiSdkApiError(err);
	const parsed = parseProviderErrorBody(apiErr?.responseBody ?? null);
	// Capture stack (truncated) when the underlying error exposes one — it's
	// the most useful diagnostic for transport / SDK failures that don't have
	// a structured response body (e.g. socket reset, JSON parse errors).
	const rawStack =
		err instanceof Error && typeof err.stack === "string"
			? err.stack
			: undefined;
	const stack = rawStack ? rawStack.slice(0, 4_000) : undefined;
	return {
		preset: request.providerPreset,
		apiFormat: request.apiFormat,
		baseUrl: request.baseUrl,
		model: request.model,
		statusCode: apiErr?.statusCode,
		endpointUrl: apiErr?.url,
		responseBodySnippet: snippet(apiErr?.responseBody ?? null),
		providerErrorCode: parsed?.code,
		providerErrorMessage: parsed?.message,
		...(stack ? { stack } : {}),
	};
}

/**
 * Compose a single-line, human-readable error message that includes the
 * request context. Falls back to the original message when no context is
 * available. Used by both broadcast (`type:'error'`) and main-process log.
 */
export function formatLLMErrorMessage(
	err: unknown,
	request: Pick<
		ChatCompletionRequest,
		"providerPreset" | "apiFormat" | "baseUrl" | "model"
	>,
): string {
	const sdkMessage =
		err instanceof Error
			? err.message
			: typeof err === "string"
				? err
				: "Stream failed";
	const ctx = buildLLMErrorContext(err, request);

	// Prefer the provider's business-error message when available — it usually
	// tells the user exactly what's wrong (model not activated, quota,
	// invalid param, …). The SDK's bare "Bad Request" buries that info.
	const headline =
		ctx.providerErrorMessage ??
		(ctx.providerErrorCode ? `Provider error ${ctx.providerErrorCode}` : sdkMessage);

	const parts: string[] = [];
	if (ctx.providerErrorMessage && ctx.providerErrorCode)
		parts.push(`code=${ctx.providerErrorCode}`);
	if (ctx.statusCode !== undefined) parts.push(`HTTP ${ctx.statusCode}`);
	if (ctx.endpointUrl) parts.push(`endpoint=${ctx.endpointUrl}`);
	if (ctx.model) parts.push(`model=${ctx.model}`);
	if (ctx.apiFormat) parts.push(`apiFormat=${ctx.apiFormat}`);
	if (ctx.preset) parts.push(`preset=${ctx.preset}`);
	// Fall back to the raw body only when we couldn't parse a structured error.
	if (!ctx.providerErrorMessage && ctx.responseBodySnippet)
		parts.push(`body=${JSON.stringify(ctx.responseBodySnippet)}`);
	if (parts.length === 0) return headline;
	return `${headline} — ${parts.join(", ")}`;
}
