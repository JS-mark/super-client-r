import type { Context, Next } from "koa";
import { logger } from "../../utils/logger";

const log = logger.withContext("ApiServer");

export const requestLogger = async (ctx: Context, next: Next) => {
	const start = Date.now();

	const reqMeta: Record<string, unknown> = { ip: ctx.ip };
	if (ctx.querystring) {
		reqMeta.query = ctx.query;
	}
	if (ctx.request.body && Object.keys(ctx.request.body as object).length > 0) {
		reqMeta.body = ctx.request.body;
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
