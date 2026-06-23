import type Koa from "koa";
import { logger } from "../../utils/logger";

const log = logger.withContext("ApiServer");

/** Field names whose values must be redacted before logging. */
const SENSITIVE_FIELDS = new Set([
	"apiKey",
	"api_key",
	"apikey",
	"accessToken",
	"access_token",
	"refreshToken",
	"refresh_token",
	"password",
	"secret",
	"token",
	"authorization",
]);

/**
 * Recursively replace values of sensitive fields with `"***"`. Returns a
 * shallow-cloned structure; original input is not mutated.
 */
function redact(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => redact(item));
	}
	if (value && typeof value === "object") {
		const src = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(src)) {
			if (SENSITIVE_FIELDS.has(key)) {
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
	} catch (err) {
		throw err;
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
