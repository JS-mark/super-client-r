import type Koa from "koa";
import proxy from "koa-proxies";

export const setupProxyRoutes = (app: Koa) => {
	// Proxy for Skills Market
	// https://skillsmp.com/api/skills -> /api/skills
	app.use(
		proxy("/api/skills", {
			target: "https://skillsmp.com",
			changeOrigin: true,
			logs: true,
		}),
	);
};
