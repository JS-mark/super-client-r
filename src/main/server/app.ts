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
		this.app.use(this.pluginDevGuideMiddleware());
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
				return join(require.resolve("swagger-ui-dist"), "..");
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
					ctx.type =
						MIME_TYPES[extname(fileName)] || "application/octet-stream";
					ctx.body = cached;
					return;
				}

				try {
					const filePath = join(getSwaggerUiDir(), fileName);
					const content = await readFile(filePath);
					fileCache.set(fileName, content);
					ctx.type =
						MIME_TYPES[extname(fileName)] || "application/octet-stream";
					ctx.body = content;
				} catch {
					ctx.status = 404;
				}
				return;
			}

			return next();
		};
	}

	/**
	 * 应用插件开发说明页。
	 * 放在本地 API 服务下，方便用户从 Settings → API 服务直接打开查看。
	 */
	private pluginDevGuideMiddleware(): Koa.Middleware {
		return async (ctx, next) => {
			if (ctx.path !== "/plugin-dev") {
				return next();
			}

			ctx.type = "text/html";
			ctx.body = pluginDevGuideHtml();
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

function pluginDevGuideHtml(): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Super Client R - 应用插件开发指南</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --panel-soft: #f0f3f7;
      --text: #1f2328;
      --muted: #647084;
      --line: #d8dee8;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --code-bg: #111827;
      --code-text: #d1d5db;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111318;
        --panel: #1a1d24;
        --panel-soft: #20242d;
        --text: #e7e9ee;
        --muted: #9aa4b2;
        --line: #2f3542;
        --accent: #60a5fa;
        --accent-soft: rgba(96, 165, 250, 0.14);
        --code-bg: #0b1020;
        --code-text: #dbe4f0;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.6;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .shell {
      max-width: 1180px;
      margin: 0 auto;
      padding: 40px 28px 56px;
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 24px;
      align-items: stretch;
      margin-bottom: 24px;
    }
    .hero-main, .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
    }
    .hero-main {
      padding: 34px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }
    h1 {
      margin: 18px 0 12px;
      font-size: 34px;
      line-height: 1.16;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 21px;
      line-height: 1.25;
      letter-spacing: 0;
    }
    h3 {
      margin: 18px 0 8px;
      font-size: 16px;
    }
    p { margin: 0 0 12px; color: var(--muted); }
    .hero-aside {
      padding: 24px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
    }
    .quick-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 10px;
    }
    .quick-list li {
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--panel-soft);
      color: var(--muted);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .panel {
      padding: 24px;
      min-width: 0;
    }
    .wide { grid-column: 1 / -1; }
    code {
      padding: 2px 5px;
      border-radius: 5px;
      background: var(--panel-soft);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.92em;
    }
    pre {
      margin: 12px 0 0;
      padding: 16px;
      overflow: auto;
      border-radius: 12px;
      background: var(--code-bg);
      color: var(--code-text);
      font-size: 13px;
      line-height: 1.55;
    }
    pre code {
      padding: 0;
      background: transparent;
      color: inherit;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 14px;
    }
    .table th, .table td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    .table th {
      color: var(--text);
      font-weight: 600;
      background: var(--panel-soft);
    }
    .steps {
      counter-reset: step;
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    .steps li {
      counter-increment: step;
      position: relative;
      padding-left: 42px;
      color: var(--muted);
    }
    .steps li::before {
      content: counter(step);
      position: absolute;
      left: 0;
      top: 0;
      width: 28px;
      height: 28px;
      border-radius: 9px;
      display: grid;
      place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
    }
    .footer {
      margin-top: 24px;
      color: var(--muted);
      font-size: 13px;
    }
    @media (max-width: 860px) {
      .shell { padding: 24px 16px 40px; }
      .hero, .grid { grid-template-columns: 1fr; }
      .wide { grid-column: auto; }
      h1 { font-size: 28px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-main">
        <span class="eyebrow">Super Client R App Plugins</span>
        <h1>应用插件开发指南</h1>
        <p>应用插件用于扩展 Super Client R 的客户端能力，包括命令、设置页、侧边栏入口、主题、Markdown 渲染样式、MCP 工具和 Skill 能力。</p>
        <p>插件运行在主进程托管的沙箱 API 上。需要访问文件、存储、窗口、命令或能力注册时，必须在 manifest 中声明权限。</p>
      </div>
      <aside class="hero-aside">
        <h2>开发路径</h2>
        <ul class="quick-list">
          <li>1. 新建插件目录和 <code>plugin.json</code></li>
          <li>2. 编写入口文件 <code>index.js</code></li>
          <li>3. 声明 commands / views / themes / tools</li>
          <li>4. 在应用插件中心安装本地插件</li>
          <li>5. 在日志查看器中按 <code>Plugin:&lt;id&gt;</code> 排查问题</li>
        </ul>
      </aside>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>推荐目录结构</h2>
        <pre><code>my-plugin/
  plugin.json
  index.js
  pages/
    dashboard.html
  assets/
    icon.png</code></pre>
      </article>

      <article class="panel">
        <h2>最小 manifest</h2>
        <pre><code>{
  "id": "my-plugin",
  "name": "my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "main": "index.js",
  "permissions": ["storage", "window"],
  "contributes": {
    "commands": [
      {
        "command": "my-plugin.hello",
        "title": "Say Hello"
      }
    ]
  }
}</code></pre>
      </article>

      <article class="panel wide">
        <h2>入口文件示例</h2>
        <pre><code>exports.activate = async function activate(context) {
  const api = context.api;
  api.logger.info("Plugin activated");

  context.subscriptions.push(
    api.commands.registerCommand("my-plugin.hello", async () => {
      await api.window.showInformationMessage("Hello from plugin");
      return { message: "Hello" };
    })
  );
};

exports.deactivate = async function deactivate(context) {
  context.api?.logger.info("Plugin deactivated");
};</code></pre>
      </article>

      <article class="panel">
        <h2>常用贡献点</h2>
        <table class="table">
          <thead><tr><th>贡献点</th><th>用途</th></tr></thead>
          <tbody>
            <tr><td><code>commands</code></td><td>注册命令，可在应用插件中心执行，也可返回模板内容给聊天使用。</td></tr>
            <tr><td><code>sidebars</code></td><td>向主侧边栏贡献一个入口，通常指向插件页面。</td></tr>
            <tr><td><code>settingsPanels</code></td><td>在设置页增加插件配置面板。</td></tr>
            <tr><td><code>themes</code></td><td>提供客户端皮肤或 Markdown 渲染主题。</td></tr>
            <tr><td><code>mcpTools</code></td><td>注册 Agent 可调用的内部 MCP 工具。</td></tr>
            <tr><td><code>skills</code></td><td>贡献可注入 Agent 上下文的 Skill。</td></tr>
          </tbody>
        </table>
      </article>

      <article class="panel">
        <h2>权限模型</h2>
        <p>插件必须先声明权限，运行时 API 会按插件 ID 校验权限。未授权时对应 API 会抛错。</p>
        <table class="table">
          <thead><tr><th>权限</th><th>说明</th></tr></thead>
          <tbody>
            <tr><td><code>storage</code></td><td>读写插件自己的持久化数据。</td></tr>
            <tr><td><code>filesystem</code></td><td>访问允许范围内的文件。</td></tr>
            <tr><td><code>network</code></td><td>发起网络请求。</td></tr>
            <tr><td><code>window</code></td><td>显示消息、输入框、选择框等 UI。</td></tr>
            <tr><td><code>commands</code></td><td>注册和执行命令。</td></tr>
          </tbody>
        </table>
      </article>

      <article class="panel wide">
        <h2>本地调试流程</h2>
        <ol class="steps">
          <li>在任意目录创建插件文件夹，确保包含 <code>plugin.json</code> 和入口文件。</li>
          <li>打开 Super Client R → 应用插件 → 安装本地应用插件，选择插件目录。</li>
          <li>如果插件声明了权限，确认授权后启用插件。</li>
          <li>修改代码后重新安装或使用开发加载能力刷新插件。</li>
          <li>打开日志查看器，按 <code>Plugin:my-plugin</code> 过滤插件日志。</li>
        </ol>
      </article>
    </section>

    <p class="footer">完整内部参考可查看仓库文档：<code>packages/docs/PLUGIN_DEVELOPMENT.md</code>。</p>
  </main>
</body>
</html>`;
}
