import crypto from "crypto";
import type Koa from "koa";
import { SERVER_CONFIG, getOrCreateApiKey } from "../config";

/**
 * 公开路径匹配：精确相等，或对以 `/` 结尾的目录前缀做子路径匹配。
 *
 * 不再用裸 `startsWith(p)` —— 那会让 `/health/../v1/xxx` 这类带 `..` 的路径
 * 命中 `/health` 白名单从而绕过鉴权。目录白名单（如 `/swagger-ui/`）显式以
 * `/` 结尾，只匹配其真实子路径。
 */
function isPublicPath(path: string): boolean {
	return SERVER_CONFIG.PUBLIC_PATHS.some((p) =>
		p.endsWith("/") ? path.startsWith(p) : path === p,
	);
}

/**
 * 恒定时间比较两个 token，避免逐字节短路带来的计时侧信道。
 * 先各自 SHA-256 成定长 buffer，再 timingSafeEqual —— 长度不同也不泄漏。
 */
function tokensMatch(token: string, apiKey: string): boolean {
	if (!apiKey) return false;
	const a = crypto.createHash("sha256").update(token).digest();
	const b = crypto.createHash("sha256").update(apiKey).digest();
	return crypto.timingSafeEqual(a, b);
}

export const authMiddleware = async (ctx: Koa.Context, next: Koa.Next) => {
	// 公开路径跳过认证
	if (isPublicPath(ctx.path)) {
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

	if (!tokensMatch(token, apiKey)) {
		ctx.status = 401;
		ctx.body = { error: "Invalid API key" };
		return;
	}

	await next();
};
