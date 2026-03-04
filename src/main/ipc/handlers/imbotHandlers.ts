import { ipcMain } from "electron";
import { IMBOT_CHANNELS } from "../channels";
import type {
	IPCRequest,
	IPCResponse,
	StartBotRequest,
	SendMessageRequest,
	BotStatus,
} from "../types";

// 延迟导入服务实例(避免循环依赖)
let imbotServiceInstance: any = null;

export function setIMBotService(service: any) {
	imbotServiceInstance = service;
}

export function getIMBotService() {
	if (!imbotServiceInstance) {
		throw new Error(
			"IMBotService not initialized. Call setIMBotService first.",
		);
	}
	return imbotServiceInstance;
}

/**
 * 注册 IM Bot 相关的 IPC 处理器
 */
export function registerIMBotHandlers(): void {
	// 列出所有机器人
	ipcMain.handle(
		IMBOT_CHANNELS.LIST_BOTS,
		async (): Promise<IPCResponse<BotStatus[]>> => {
			try {
				const imbotService = getIMBotService();
				const bots = imbotService.getBotStatuses();
				return { success: true, data: bots };
			} catch (error) {
				console.error("[IPC] LIST_BOTS error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 启动机器人
	ipcMain.handle(
		IMBOT_CHANNELS.START_BOT,
		async (
			_event,
			request: IPCRequest<StartBotRequest>,
		): Promise<IPCResponse<void>> => {
			try {
				const { config } = request.payload!;
				const imbotService = getIMBotService();
				await imbotService.startBot(config);
				return { success: true };
			} catch (error) {
				console.error("[IPC] START_BOT error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 停止机器人
	ipcMain.handle(
		IMBOT_CHANNELS.STOP_BOT,
		async (
			_event,
			request: IPCRequest<{ botId: string }>,
		): Promise<IPCResponse<void>> => {
			try {
				const { botId } = request.payload!;
				const imbotService = getIMBotService();
				await imbotService.stopBot(botId);
				return { success: true };
			} catch (error) {
				console.error("[IPC] STOP_BOT error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 获取机器人状态
	ipcMain.handle(
		IMBOT_CHANNELS.GET_BOT_STATUS,
		async (
			_event,
			request: IPCRequest<{ botId: string }>,
		): Promise<IPCResponse<BotStatus | null>> => {
			try {
				const { botId } = request.payload!;
				const imbotService = getIMBotService();
				const statuses = imbotService.getBotStatuses();
				const status = statuses.find((s: BotStatus) => s.id === botId) || null;
				return { success: true, data: status };
			} catch (error) {
				console.error("[IPC] GET_BOT_STATUS error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// 发送消息
	ipcMain.handle(
		IMBOT_CHANNELS.SEND_MESSAGE,
		async (
			_event,
			request: IPCRequest<SendMessageRequest>,
		): Promise<IPCResponse<void>> => {
			try {
				const { botId, chatId, content } = request.payload!;
				const imbotService = getIMBotService();
				const statuses = imbotService.getBotStatuses();
				const bot = imbotService["bots"].get(botId); // 访问内部 Map

				if (!bot) {
					throw new Error("Bot not found or not running");
				}

				await bot.sendMessage(chatId, content);
				return { success: true };
			} catch (error) {
				console.error("[IPC] SEND_MESSAGE error:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	console.log("[IPC] IM Bot handlers registered");
}
