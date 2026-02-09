import Router from "koa-router";

export const healthRouter = new Router();

healthRouter.get("/health", (ctx) => {
	// Access port from ctx.state or global config if needed,
	// but usually health check just returns ok.
	// The original code returned the port, which is dynamic.
	// We can pass the port or store it in app context.
	ctx.body = { status: "ok", port: (ctx.app as any).port };
});
