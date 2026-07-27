/**
 * classifyLLMError — turn a raw provider/SDK failure into a friendly,
 * actionable category for the chat ErrorCard.
 *
 * Why this exists: providers like 阿里云百炼 (DashScope) reject requests with
 * upstream business errors such as
 *   "The product is not activated, please confirm that you have activated
 *    products and try again after activation."
 * Surfacing that raw English string (or worse, a full JS stack) to the end
 * user is confusing. These failures are almost always *config* problems the
 * user can fix in the Models page — the model isn't activated on their
 * account, the API key lacks permission, the quota is exhausted, or the
 * model id / baseUrl is wrong. This helper maps the structured
 * `LLMErrorContext` (provider code/message + HTTP status) onto a small set of
 * categories so the UI can show a friendly headline + guidance and, when
 * relevant, a "go to Models" button.
 *
 * The function is intentionally pure and i18n-agnostic: it returns a stable
 * category + i18n key, and the caller resolves the localized text. The raw
 * upstream message is preserved separately (in `LLMErrorContext`) so it stays
 * available in the card's detail rows for engineers.
 */

import type { LLMErrorContext } from "@super-client/shared-types/chat";

export type LLMErrorCategory =
	/** Model not opened/activated on the provider account (百炼 typical). */
	| "not_activated"
	/** Invalid / expired / unauthorized API key. */
	| "auth"
	/** Quota exhausted or rate limited. */
	| "quota"
	/** Model id unknown or endpoint/baseUrl mismatch. */
	| "model_not_found"
	/** Anything we couldn't confidently classify. */
	| "unknown";

export interface ClassifiedLLMError {
	category: LLMErrorCategory;
	/** i18n key (ns:chat) for the friendly, user-facing headline. */
	headlineKey: string;
	/** Default (Chinese) copy for the headline, used as i18n fallback. */
	headlineFallback: string;
	/**
	 * Whether this category is something the user can fix by editing provider
	 * config — controls the "去 Models 页检查" guidance button.
	 */
	showModelsGuidance: boolean;
}

function haystack(ctx: LLMErrorContext | undefined, summary: string): string {
	return [
		ctx?.providerErrorMessage,
		ctx?.providerErrorCode,
		ctx?.responseBodySnippet,
		summary,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

/**
 * Classify a failed LLM request. `summary` is the enriched single-line message
 * produced by `formatLLMErrorMessage` (fallback when no structured body).
 */
export function classifyLLMError(
	ctx: LLMErrorContext | undefined,
	summary = "",
): ClassifiedLLMError {
	const text = haystack(ctx, summary);
	const status = ctx?.statusCode;

	// 1. Product / model not activated — the canonical 百炼 case (SUP-24).
	if (
		text.includes("not activated") ||
		text.includes("not been activated") ||
		text.includes("未开通") ||
		text.includes("product is not activated")
	) {
		return {
			category: "not_activated",
			headlineKey: "errorCard.friendly.notActivated",
			headlineFallback:
				"当前模型尚未开通或密钥无该模型权限。请前往 Models 页检查该服务商的开通状态与密钥。",
			showModelsGuidance: true,
		};
	}

	// 2. Authentication — bad / missing / expired key.
	const authByCode =
		typeof ctx?.providerErrorCode === "string" &&
		/auth|api[-_ ]?key|invalid[-_ ]?key|unauthorized|forbidden/i.test(
			ctx.providerErrorCode,
		);
	if (
		status === 401 ||
		status === 403 ||
		authByCode ||
		text.includes("invalid api key") ||
		text.includes("incorrect api key") ||
		text.includes("api key") ||
		text.includes("unauthorized") ||
		text.includes("authentication")
	) {
		return {
			category: "auth",
			headlineKey: "errorCard.friendly.auth",
			headlineFallback:
				"密钥无效或已过期。请前往 Models 页检查该服务商的 API Key 是否正确。",
			showModelsGuidance: true,
		};
	}

	// 3. Quota / rate limit.
	if (
		status === 429 ||
		text.includes("quota") ||
		text.includes("exhausted") ||
		text.includes("rate limit") ||
		text.includes("rate_limit") ||
		text.includes("too many requests") ||
		text.includes("insufficient") ||
		text.includes("欠费") ||
		text.includes("额度")
	) {
		return {
			category: "quota",
			headlineKey: "errorCard.friendly.quota",
			headlineFallback:
				"额度不足或触发限流。请检查该服务商的账户余额与调用频率后重试。",
			showModelsGuidance: true,
		};
	}

	// 4. Model not found / endpoint mismatch.
	const modelByCode =
		typeof ctx?.providerErrorCode === "string" &&
		/model[-_ ]?not[-_ ]?found|not[-_ ]?found|invalid[-_ ]?model/i.test(
			ctx.providerErrorCode,
		);
	if (
		status === 404 ||
		modelByCode ||
		text.includes("model not found") ||
		text.includes("model_not_found") ||
		text.includes("no such model") ||
		text.includes("does not exist")
	) {
		return {
			category: "model_not_found",
			headlineKey: "errorCard.friendly.modelNotFound",
			headlineFallback:
				"模型不存在或请求地址不匹配。请前往 Models 页检查模型名与 Base URL 配置。",
			showModelsGuidance: true,
		};
	}

	return {
		category: "unknown",
		headlineKey: "errorCard.friendly.unknown",
		headlineFallback: "请求失败。请稍后重试，或前往 Models 页检查服务商配置。",
		showModelsGuidance: false,
	};
}
