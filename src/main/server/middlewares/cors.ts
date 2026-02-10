import cors from "@koa/cors";
import type { Context, Next } from "koa";

// CORS 配置中间件
export const corsMiddleware = async (ctx: Context, next: Next) => {
	// 允许的开发环境 origin
	const allowedOrigins = [
		"http://localhost:5173", // Vite 默认 dev server
		"http://localhost:5174", // Vite 备用端口
		"http://localhost:3000",
		"http://127.0.0.1:5173",
		"http://127.0.0.1:5174",
		"http://127.0.0.1:3000",
	];

	const origin = ctx.headers.origin;

	// 如果是 Electron 环境（file:// 协议）或允许的 origin，则允许跨域
	if (
		!origin ||
		origin.startsWith("file://") ||
		allowedOrigins.includes(origin)
	) {
		ctx.set("Access-Control-Allow-Origin", origin || "*");
		ctx.set(
			"Access-Control-Allow-Methods",
			"GET, POST, PUT, DELETE, PATCH, OPTIONS",
		);
		ctx.set(
			"Access-Control-Allow-Headers",
			"Content-Type, Authorization, Accept",
		);
		ctx.set("Access-Control-Allow-Credentials", "true");
	}

	// 处理预检请求
	if (ctx.method === "OPTIONS") {
		ctx.status = 204;
		return;
	}

	await next();
};
