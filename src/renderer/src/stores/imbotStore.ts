/**
 * IM Bot Store
 * 管理 IM 机器人状态
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IMBotConfig, BotStatus } from "@/types/electron";

interface IMBotState {
	// 状态
	bots: IMBotConfig[];
	botStatuses: BotStatus[];
	isLoading: boolean;
	error: string | null;

	// 操作
	fetchBots: () => Promise<void>;
	addBot: (config: IMBotConfig) => Promise<void>;
	updateBot: (config: IMBotConfig) => Promise<void>;
	removeBot: (botId: string) => Promise<void>;
	startBot: (botId: string) => Promise<void>;
	stopBot: (botId: string) => Promise<void>;
	sendMessage: (
		botId: string,
		chatId: string,
		content: string,
	) => Promise<void>;

	// 辅助方法
	getBotConfig: (botId: string) => IMBotConfig | undefined;
	getBotStatus: (botId: string) => BotStatus | undefined;
}

export const useIMBotStore = create<IMBotState>()(
	persist(
		(set, get) => ({
			// 初始状态
			bots: [],
			botStatuses: [],
			isLoading: false,
			error: null,

			// 获取机器人列表和状态
			fetchBots: async () => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.imbot.listBots();
					if (response.success && response.data) {
						set({ botStatuses: response.data });
					} else {
						set({ error: response.error || "获取机器人列表失败" });
					}
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
				} finally {
					set({ isLoading: false });
				}
			},

			// 添加机器人
			addBot: async (config: IMBotConfig) => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.imbot.startBot(config);
					if (response.success) {
						set((state) => ({
							bots: [...state.bots, config],
						}));
						await get().fetchBots();
					} else {
						throw new Error(response.error || "启动机器人失败");
					}
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 更新机器人配置
			updateBot: async (config: IMBotConfig) => {
				set({ isLoading: true, error: null });
				try {
					set((state) => ({
						bots: state.bots.map((bot) =>
							bot.id === config.id ? config : bot,
						),
					}));
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 移除机器人（先停止再删除配置）
			removeBot: async (botId: string) => {
				set({ isLoading: true, error: null });
				try {
					// 先尝试停止（忽略已停止的情况）
					await window.electron.imbot.stopBot(botId);
					// 删除本地配置
					set((state) => ({
						bots: state.bots.filter((bot) => bot.id !== botId),
						botStatuses: state.botStatuses.filter(
							(status) => status.id !== botId,
						),
					}));
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 启动机器人（只控制运行状态，不修改配置）
			startBot: async (botId: string) => {
				const config = get().getBotConfig(botId);
				if (!config) {
					throw new Error("机器人配置不存在");
				}
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.imbot.startBot(config);
					if (!response.success) {
						throw new Error(response.error || "启动机器人失败");
					}
					await get().fetchBots();
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 停止机器人（只控制运行状态，不修改配置）
			stopBot: async (botId: string) => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.imbot.stopBot(botId);
					if (!response.success) {
						throw new Error(response.error || "停止机器人失败");
					}
					await get().fetchBots();
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 发送消息
			sendMessage: async (botId: string, chatId: string, content: string) => {
				set({ isLoading: true, error: null });
				try {
					const response = await window.electron.imbot.sendMessage(
						botId,
						chatId,
						content,
					);
					if (!response.success) {
						throw new Error(response.error || "发送消息失败");
					}
				} catch (error) {
					set({
						error: error instanceof Error ? error.message : String(error),
					});
					throw error;
				} finally {
					set({ isLoading: false });
				}
			},

			// 获取机器人配置
			getBotConfig: (botId: string) => {
				return get().bots.find((bot) => bot.id === botId);
			},

			// 获取机器人状态
			getBotStatus: (botId: string) => {
				return get().botStatuses.find((status) => status.id === botId);
			},
		}),
		{
			name: "imbot-storage",
			partialize: (state) => ({ bots: state.bots }), // 只持久化配置
		},
	),
);
