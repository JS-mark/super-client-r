import { request, summary, tags, description } from "koa-swagger-decorator";

// node-auth 服务端地址（开发环境）
const NODE_AUTH_BASE_URL =
	process.env.NODE_AUTH_BASE_URL || "http://localhost:3001";

export class AppConfigController {
	@request("get", "/v1/app/init-config")
	@summary("获取应用初始化配置")
	@description("代理到 node-auth 服务端获取应用初始化配置")
	@tags(["AppConfig"])
	async getInitConfig(ctx: any) {
		try {
			// 转发请求头
			const headers: Record<string, string> = {
				"X-App-Version": ctx.get("X-App-Version") || "unknown",
				"X-Platform": ctx.get("X-Platform") || "unknown",
				"X-Locale": ctx.get("X-Locale") || "en-US",
			};

			console.log(
				`[AppConfig] Proxying to ${NODE_AUTH_BASE_URL}/v1/app/init-config`,
			);

			const response = await fetch(`${NODE_AUTH_BASE_URL}/v1/app/init-config`, {
				method: "GET",
				headers,
			});

			if (!response.ok) {
				console.error(
					`[AppConfig] Proxy error: ${response.status} ${response.statusText}`,
				);
				ctx.status = response.status;
				ctx.body = {
					error: "Failed to fetch app config",
					message: response.statusText,
				};
				return;
			}

			const data = await response.json();

			// 转发响应头
			const cacheControl = response.headers.get("Cache-Control");
			if (cacheControl) {
				ctx.set("Cache-Control", cacheControl);
			}

			const configVersion = response.headers.get("X-Config-Version");
			if (configVersion) {
				ctx.set("X-Config-Version", configVersion);
			}

			ctx.body = data;
		} catch (error) {
			console.error("[AppConfig] Proxy failed:", error);
			ctx.status = 500;
			ctx.body = {
				error: "Failed to fetch app config",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
