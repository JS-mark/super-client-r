import type Koa from "koa";
import { logger } from "../../utils/logger";

const log = logger.withContext("ApiServer");

/**
 * Field names whose values must be redacted before logging (matched
 * case-insensitively — see `SENSITIVE_FIELDS.has(key.toLowerCase())`).
 */
const SENSITIVE_FIELDS = new Set([
	"apikey",
	"api_key",
	"accesstoken",
	"access_token",
	"refreshtoken",
	"refresh_token",
	"password",
	"secret",
	"token",
	"authorization",
]);

/**
 * 值形态兜底：即便字段名没命中 SENSITIVE_FIELDS，只要值"看起来像密钥"
 * （sk- 前缀、Bearer 授权头、或高熵长 token），也一律打码。防止把密钥经
 * 未预料的字段名（如 header 名变体、嵌套自定义字段）泄漏进日志。
 */
function looksLikeSecret(value: string): boolean {
	const v = value.trim();
	if (!v) return false;
	// 常见 API key / 授权头前缀。
	if (/^sk-/i.test(v)) return true;
	if (/^Bearer\s+\S/i.test(v)) return true;
	if (/^(gh[pousr]_|xox[baprs]-|AKIA)/.test(v)) return true;
	return false;
}

function redactString(value: string): string {
	return looksLikeSecret(value) ? "***" : value;
}

/**
 * Recursively replace values of sensitive fields with `"***"`. Returns a
 * shallow-cloned structure; original input is not mutated.
 *
 * 两道防线：① 字段名精确匹配 SENSITIVE_FIELDS；② 值形态兜底 looksLikeSecret。
 */
export function redact(value: unknown): unknown {
	if (typeof value === "string") {
		return redactString(value);
	}
	if (Array.isArray(value)) {
		return value.map((item) => redact(item));
	}
	if (value && typeof value === "object") {
		const src = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(src)) {
			if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
				out[key] = src[key] ? "***" : src[key];
			} else {
				out[key] = redact(src[key]);
			}
		}
		return out;
	}
	return value;
}

export const requestLogger = async (ctx: Koa.Context, next: Koa.Next) => {
	const start = Date.now();

	const reqMeta: Record<string, unknown> = { ip: ctx.ip };
	if (ctx.querystring) {
		reqMeta.query = redact(ctx.query);
	}
	if (ctx.request.body && Object.keys(ctx.request.body as object).length > 0) {
		reqMeta.body = redact(ctx.request.body);
	}

	log.info(`--> ${ctx.method} ${ctx.path}`, reqMeta);

	try {
		await next();
	} finally {
		const duration = Date.now() - start;
		const status = ctx.status;
		const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

		const resMeta = {
			status,
			duration: `${duration}ms`,
		};

		if (level === "error") {
			log.error(`<-- ${ctx.method} ${ctx.path} ${status}`, undefined, resMeta);
		} else if (level === "warn") {
			log.warn(`<-- ${ctx.method} ${ctx.path} ${status}`, resMeta);
		} else {
			log.info(`<-- ${ctx.method} ${ctx.path} ${status}`, resMeta);
		}
	}
};
