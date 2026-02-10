import { BrowserWindow } from "electron";
import getPort from "get-port";
import type { Server } from "http";
import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { storeManager } from "../store";
import { SERVER_CONFIG } from "./config";
import { authMiddleware } from "./middlewares/auth";
import { corsMiddleware } from "./middlewares/cors";
import { errorHandler } from "./middlewares/error";
import { setupRoutes } from "./routes";

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
		this.app.use(bodyParser());
		this.app.use(errorHandler);
		this.app.use(authMiddleware);
	}

	private setupRoutes() {
		const router = setupRoutes();
		this.app.use(router.routes());
		this.app.use(router.allowedMethods());
	}

	public async start(port?: number) {
		if (this.isRunning) {
			console.log("Server is already running");
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
					console.log(`Local server running on port ${this.port}`);
					this.isRunning = true;
					this.broadcastStatus();
					resolve();
				});

				this.server.on("error", (err) => {
					console.error("Server start error:", err instanceof Error ? err.message : String(err));
					reject(err);
				});
			});
		} catch (error) {
			console.error("Failed to start local server:", error);
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
					console.error("Error stopping server:", err instanceof Error ? err.message : String(err));
					reject(err);
				} else {
					this.isRunning = false;
					this.server = null;
					console.log("Local server stopped");
					this.broadcastStatus();
					resolve();
				}
			});
		});
	}

	public async restart(port?: number) {
		console.log("Restarting server...");
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
