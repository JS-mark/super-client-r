import type { Context, Next } from "koa";
import { SERVER_CONFIG, getOrCreateApiKey } from "../config";

export const authMiddleware = async (ctx: Context, next: Next) => {
	// 公开路径跳过认证
	if (SERVER_CONFIG.PUBLIC_PATHS.some((p) => ctx.path.startsWith(p))) {
		return next();
	}

	const authHeader = ctx.headers.authorization;
	if (!authHeader) {
		ctx.status = 401;
		ctx.body = { error: "Authorization header is required" };
		return;
	}

	const parts = authHeader.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") {
		ctx.status = 401;
		ctx.body = { error: "Invalid authorization format. Use: Bearer <api-key>" };
		return;
	}

	const token = parts[1];
	const apiKey = getOrCreateApiKey();

	if (token !== apiKey) {
		ctx.status = 401;
		ctx.body = { error: "Invalid API key" };
		return;
	}

	await next();
};
