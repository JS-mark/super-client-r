import { BrowserWindow, app as electronApp } from "electron";
import { readFile } from "fs/promises";
import getPort from "get-port";
import type { Server } from "http";
import { join, extname } from "path";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { storeManager } from "../store";
import { logger } from "../utils/logger";
import { SERVER_CONFIG, getOrCreateApiKey } from "./config";
import { authMiddleware } from "./middlewares/auth";
import { corsMiddleware } from "./middlewares/cors";
import { errorHandler } from "./middlewares/error";
import { requestLogger } from "./middlewares/requestLogger";
import { setupRoutes } from "./routes";

const log = logger.withContext("ApiServer");

const MIME_TYPES: Record<string, string> = {
	".js": "application/javascript",
	".css": "text/css",
	".html": "text/html",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".map": "application/json",
};

export class LocalServer {
	private app: Koa;
	private port: number = SERVER_CONFIG.PORT;
	private server: Server | null = null;
	private isRunning: boolean = false;

	constructor() {
		this.app = new Koa();
		this.setupMiddleware();
		this.setupRoutes();
	}

	private setupMiddleware() {
		this.app.use(corsMiddleware);
		this.app.use(this.faviconMiddleware());
		this.app.use(this.swaggerUiMiddleware());
		this.app.use(bodyParser());
		this.app.use(requestLogger);
		this.app.use(errorHandler);
		this.app.use(authMiddleware);
	}

	private faviconMiddleware(): Koa.Middleware {
		let iconCache: Buffer | null = null;

		return async (ctx, next) => {
			if (ctx.path !== "/favicon.ico") {
				return next();
			}

			if (iconCache) {
				ctx.type = "image/png";
				ctx.body = iconCache;
				return;
			}

			try {
				const iconPath = electronApp.isPackaged
					? join(process.resourcesPath, "build", "icons", "icon.png")
					: join(electronApp.getAppPath(), "build", "icons", "icon.png");
				iconCache = await readFile(iconPath);
				ctx.type = "image/png";
				ctx.body = iconCache;
			} catch {
				ctx.status = 204;
			}
		};
	}

	/**
	 * 本地提供 Swagger UI 静态文件，替代 koa-swagger-decorator 的 CDN 加载
	 * - /api-docs → 自定义 HTML（引用本地 JS/CSS）
	 * - /swagger-ui/* → swagger-ui-dist 静态文件
	 */
	private swaggerUiMiddleware(): Koa.Middleware {
		const fileCache = new Map<string, Buffer>();

		const getSwaggerUiDir = () => {
			// swagger-ui-dist 作为 externalized dep 始终在 node_modules 中
			try {
				return join(
					require.resolve("swagger-ui-dist"),
					"..",
				);
			} catch {
				return join(
					electronApp.getAppPath(),
					"node_modules",
					"swagger-ui-dist",
				);
			}
		};

		return async (ctx, next) => {
			// 自定义 /api-docs HTML 页面
			if (ctx.path === "/api-docs") {
				ctx.type = "text/html";
				ctx.body = swaggerHtml("/swagger.json", getOrCreateApiKey());
				return;
			}

			// 提供 /swagger-ui/ 下的静态文件
			if (ctx.path.startsWith("/swagger-ui/")) {
				const fileName = ctx.path.replace("/swagger-ui/", "");

				// 安全检查：防止路径遍历
				if (fileName.includes("..") || fileName.includes("/")) {
					ctx.status = 400;
					return;
				}

				const cached = fileCache.get(fileName);
				if (cached) {
					ctx.type = MIME_TYPES[extname(fileName)] || "application/octet-stream";
					ctx.body = cached;
					return;
				}

				try {
					const filePath = join(getSwaggerUiDir(), fileName);
					const content = await readFile(filePath);
					fileCache.set(fileName, content);
					ctx.type = MIME_TYPES[extname(fileName)] || "application/octet-stream";
					ctx.body = content;
				} catch {
					ctx.status = 404;
				}
				return;
			}

			return next();
		};
	}

	private setupRoutes() {
		const router = setupRoutes();
		this.app.use(router.routes());
		this.app.use(router.allowedMethods());
	}

	public async start(port?: number) {
		if (this.isRunning) {
			log.warn("Server is already running");
			return;
		}

		try {
			// 优先使用参数传入的端口，其次是配置的端口，最后是默认端口
			const configuredPort =
				port || storeManager.getConfig("apiPort") || SERVER_CONFIG.PORT;

			// 获取可用端口
			const getPortFunc = (getPort as any).default || getPort;
			this.port = await getPortFunc({ port: configuredPort });

			// Store port in app context for routes to access if needed
			(this.app as any).port = this.port;

			return new Promise<void>((resolve, reject) => {
				this.server = this.app.listen(this.port, () => {
					log.info(`Server started on port ${this.port}`);
					this.isRunning = true;
					this.broadcastStatus();
					resolve();
				});

				this.server.on("error", (err) => {
					log.error(
						"Server start error",
						err instanceof Error ? err : undefined,
					);
					reject(err);
				});
			});
		} catch (error) {
			log.error(
				"Failed to start server",
				error instanceof Error ? error : undefined,
			);
			throw error;
		}
	}

	public async stop() {
		if (!this.server || !this.isRunning) {
			return;
		}

		return new Promise<void>((resolve, reject) => {
			this.server?.close((err) => {
				if (err) {
					log.error(
						"Error stopping server",
						err instanceof Error ? err : undefined,
					);
					reject(err);
				} else {
					this.isRunning = false;
					this.server = null;
					log.info("Server stopped");
					this.broadcastStatus();
					resolve();
				}
			});
		});
	}

	public async restart(port?: number) {
		log.info("Restarting server...");
		await this.stop();
		await this.start(port);
	}

	public getStatus() {
		return {
			status: this.isRunning ? "running" : "stopped",
			port: this.port,
		};
	}

	public getPort() {
		return this.port;
	}

	private broadcastStatus() {
		const status = this.getStatus();
		BrowserWindow.getAllWindows().forEach((win) => {
			// 发送状态更新
			win.webContents.send("server-status-update", status);
			// 兼容旧的端口更新事件
			if (this.isRunning) {
				win.webContents.send("server-port-update", this.port);
			}
		});
	}
}

/**
 * 生成 Swagger UI HTML，使用本地静态文件
 */
function swaggerHtml(specUrl: string, apiKey: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Super Client R - API Docs</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/swagger-ui/swagger-ui-bundle.js"></script>
  <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "${specUrl}",
        dom_id: "#swagger-ui",
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "StandaloneLayout",
        deepLinking: true,
        persistAuthorization: true,
        requestInterceptor: function(req) {
          req.headers['Authorization'] = 'Bearer ${apiKey}';
          return req;
        },
      });
    };
  </script>
</body>
</html>`;
}
