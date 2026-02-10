import { SwaggerRouter } from "koa-swagger-decorator";
import { swaggerConfig } from "../middlewares/swagger";
import { HealthController } from "./health";
import { SkillsController } from "./proxy";

export const setupRoutes = () => {
	const router = new SwaggerRouter({}, swaggerConfig);

	// 显式注册控制器类，让装饰器生效
	// 使用 router.map() 而不是手动 router.get()，这样装饰器才会被处理
	router.map(HealthController, {});
	router.map(SkillsController, {});

	// 注册 Swagger 路由（必须在 map 之后调用）
	router.swagger(swaggerConfig);

	return router;
};
