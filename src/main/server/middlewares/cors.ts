import type Koa from "koa";

/**
 * 允许携带凭据（Authorization / Cookie）跨域访问的 origin 白名单。
 *
 * 仅回环地址上的本地开发 server。生产 Electron 渲染进程走 `file://`（无 Origin
 * 头或 `Origin: null`），属于同源/无源请求，不需要 CORS 放行——因此这里**不**再
 * 把 `!origin` / `file://` 无条件放行并配 `*` + credentials（那会让任意页面带凭据
 * 访问本地 API）。
 */
const ALLOWED_ORIGINS = new Set([
	"http://localhost:5173", // Vite 默认 dev server
	"http://localhost:5174", // Vite 备用端口
	"http://localhost:3000",
	"http://127.0.0.1:5173",
	"http://127.0.0.1:5174",
	"http://127.0.0.1:3000",
]);

// CORS 配置中间件
export const corsMiddleware = async (ctx: Koa.Context, next: Koa.Next) => {
	const origin = ctx.headers.origin;

	// 仅对白名单内的 origin 精确回显，且严禁使用 `*` 与 credentials 组合。
	// 白名单外（含 file:// 及无 Origin 的本地请求）不设置 CORS 头——同源/Electron
	// 内部请求本就不受 CORS 限制，浏览器跨站请求则被正确拒绝。
	if (origin && ALLOWED_ORIGINS.has(origin)) {
		ctx.set("Access-Control-Allow-Origin", origin);
		ctx.set("Vary", "Origin");
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
