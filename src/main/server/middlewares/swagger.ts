import type { SwaggerRouter } from "koa-swagger-decorator";

// 获取 SwaggerRouter 的构造函数参数类型
type SwaggerRouterOptions = ConstructorParameters<typeof SwaggerRouter>[1];

export const swaggerConfig: SwaggerRouterOptions = {
	title: "Super Client R API",
	description: "Super Client R HTTP API 文档",
	version: "1.0.0",
	swaggerJsonEndpoint: "/swagger.json",
	// HTML 端点由 app.ts 的 swaggerUiMiddleware 提供（本地 swagger-ui-dist）
	// 设为空字符串以禁用 koa-swagger-decorator 的 CDN 版本
	swaggerHtmlEndpoint: "",
	prefix: "",
	swaggerOptions: {
		securityDefinitions: {
			BearerAuth: {
				type: "apiKey",
				in: "header",
				name: "Authorization",
				description: "Bearer token authorization",
			},
		},
		security: [{ BearerAuth: [] }],
	},
};
