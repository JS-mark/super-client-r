import type Koa from "koa";
import { healthRouter } from "./health";
import { setupProxyRoutes } from "./proxy";

export const setupRoutes = (app: Koa) => {
	app.use(healthRouter.routes());
	app.use(healthRouter.allowedMethods());

	setupProxyRoutes(app);
};
