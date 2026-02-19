import { request, summary, tags, description } from "koa-swagger-decorator";

export class HealthController {
	@request("get", "/health")
	@summary("健康检查")
	@description("检查服务是否正常运行")
	@tags(["Health"])
	async healthCheck(ctx: any) {
		ctx.body = { status: "ok", port: (ctx.app as any).port };
	}
}
