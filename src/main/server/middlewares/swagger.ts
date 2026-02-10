import type { SwaggerRouter } from "koa-swagger-decorator";

// 获取 SwaggerRouter 的构造函数参数类型
type SwaggerRouterOptions = ConstructorParameters<typeof SwaggerRouter>[1];

export const swaggerConfig: SwaggerRouterOptions = {
	title: "Super Client R API",
	description: "Super Client R HTTP API 文档",
	version: "1.0.0",
	swaggerJsonEndpoint: "/swagger.json",
	swaggerHtmlEndpoint: "/api-docs",
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
