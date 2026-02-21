import type { Context, Next } from "koa";
import { logger } from "../../utils/logger";

const log = logger.withContext("ApiServer");

export const errorHandler = async (ctx: Context, next: Next) => {
	try {
		await next();
	} catch (err: any) {
		ctx.status = err.status || 500;
		ctx.body = { error: err.message };
		log.error(
			`Server error: ${ctx.method} ${ctx.path}`,
			err instanceof Error ? err : undefined,
			{ status: ctx.status },
		);
	}
};
