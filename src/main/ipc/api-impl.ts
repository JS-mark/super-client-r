/**
 * Typed IPC Proxy — API 实现
 *
 * 所有通过 registerAPI 自动注册的 RPC 方法在此定义。
 * Streaming handlers 需要访问 event.sender 的，仍用 ipcMain.handle 手动注册。
 *
 * 添加新功能只需：
 *   1. 在对应 namespace 添加方法
 *   2. 实现逻辑
 *   channel 名称自动生成，preload 自动桥接。
 *
 * 命名规则：
 *   - namespace: camelCase → 自动转为 kebab-case channel 前缀
 *   - method: camelCase → 自动转为 kebab-case channel 后缀
 *   - 例：webhook.getConfigs → webhook:get-configs
 *
 * ⚠️ method 名称必须与现有 channel 后缀匹配！
 *   - channel "skill:list" → method 应为 `list`（不是 `listSkills`）
 *   - channel "skill:get-system-prompt" → method 应为 `getSystemPrompt`
 */

import { registerAPI } from "./register";
import { storeManager } from "../store/StoreManager";
import { webhookService } from "../services/market/WebhookService";
import { authService } from "../services/auth/AuthService";
import { conversationStorage } from "../services/chat/ConversationStorageService";
import { appConfigService } from "../services/config/AppConfigService";
import { searchService } from "../services/search/SearchService";
import { getSkillService } from "../services/skill/SkillService";
import { proxyService } from "../services/network/ProxyService";
import { requestLogService } from "../services/network/RequestLogService";
import { llmService } from "../services/llm";
import type {
	WebhookConfig,
	SearchExecuteRequest,
	AuthProvider,
	ConversationSummary,
	ProxyConfig,
	ModelProvider,
	ModelProviderPreset,
	ActiveModelSelection,
} from "./types";
import type { SearchConfig, SearchProviderType } from "../store";

const apiImpl = {
	// ─── Webhook ──────────────────────────────
	// channels: webhook:get-configs, webhook:save-config, webhook:delete-config, webhook:test
	webhook: {
		getConfigs: () => storeManager.getWebhookConfigs(),
		saveConfig: (config: WebhookConfig) =>
			storeManager.saveWebhookConfig(config),
		deleteConfig: (id: string) => storeManager.deleteWebhookConfig(id),
		test: (configId: string) => webhookService.test(configId),
	},

	// ─── Auth ─────────────────────────────────
	// channels: auth:login, auth:logout, auth:get-user
	auth: {
		login: async (provider: AuthProvider) => {
			const user = await authService.login(provider);
			// 切换对话存储到用户目录
			conversationStorage.setCurrentUser(user.id);
			return user;
		},
		logout: async () => {
			await authService.logout();
			// 切换回匿名目录
			conversationStorage.setCurrentUser(null);
		},
		getUser: () => authService.getUser(),
	},

	// ─── App Config ───────────────────────────
	// channels: app-config:get-config, app-config:refresh
	// broadcast 由 AppConfigService 直接调用 broadcastEvent()
	appConfig: {
		getConfig: () => appConfigService.getConfig(),
		refresh: () => appConfigService.refresh(),
	},

	// ─── Search ───────────────────────────────
	// channels: search:execute, search:get-configs, search:save-config,
	//           search:delete-config, search:set-default, search:get-default,
	//           search:validate-config
	search: {
		execute: (request: SearchExecuteRequest) =>
			searchService.execute(request),
		getConfigs: () => ({
			configs: storeManager.getSearchConfigs(),
			defaultProvider: storeManager.getDefaultSearchProvider(),
		}),
		saveConfig: (config: SearchConfig) =>
			storeManager.saveSearchConfig(config),
		deleteConfig: (id: string) => storeManager.deleteSearchConfig(id),
		setDefault: (provider: SearchProviderType | null) =>
			storeManager.setDefaultSearchProvider(provider),
		getDefault: () => storeManager.getDefaultSearchProvider(),
		validateConfig: async (config: SearchConfig) => {
			// SearXNG 不一定需要 apiKey
			if (
				(!config.apiKey || config.apiKey.trim() === "") &&
				config.provider !== "searxng"
			) {
				return { valid: false, error: "API Key is required" };
			}
			if (
				config.provider === "searxng" &&
				(!config.apiUrl || config.apiUrl.trim() === "")
			) {
				return {
					valid: false,
					error: "API URL is required for SearXNG",
				};
			}
			try {
				await searchService.execute({
					provider: config.provider,
					query: "test",
					apiKey: config.apiKey,
					apiUrl: config.apiUrl,
					maxResults: 1,
					config: config.config,
				});
				return { valid: true };
			} catch (error) {
				return {
					valid: false,
					error:
						error instanceof Error
							? error.message
							: "Validation failed",
				};
			}
		},
	},

	// ─── Chat ─────────────────────────────────
	// channels: chat:list-conversations, chat:create-conversation, chat:delete-conversation,
	//           chat:rename-conversation, chat:get-messages, chat:save-messages,
	//           chat:append-message, chat:update-message, chat:clear-messages,
	//           chat:get-last-conversation, chat:set-last-conversation,
	//           chat:get-conversation-dir, chat:get-workspace-dir, chat:update-conversation-metadata
	chat: {
		listConversations: () => conversationStorage.getConversationList(),
		createConversation: (name: string) =>
			conversationStorage.createConversation(name || "New Chat"),
		deleteConversation: (id: string) =>
			conversationStorage.deleteConversation(id),
		renameConversation: (conversationId: string, name: string) =>
			conversationStorage.renameConversation(conversationId, name),
		getMessages: (conversationId: string) =>
			conversationStorage.getMessages(conversationId),
		saveMessages: (conversationId: string, messages: unknown[]) =>
			conversationStorage.saveMessages(conversationId, messages as any),
		appendMessage: (conversationId: string, message: unknown) =>
			conversationStorage.appendMessage(conversationId, message as any),
		updateMessage: (
			conversationId: string,
			messageId: string,
			updates: Record<string, unknown>,
		) =>
			conversationStorage.updateChatMessage(
				conversationId,
				messageId,
				updates as any,
			),
		clearMessages: (conversationId: string) =>
			conversationStorage.clearConversationMessages(conversationId),
		getLastConversation: () =>
			conversationStorage.getChatLastConversationId(),
		setLastConversation: (id: string) =>
			conversationStorage.setChatLastConversationId(id),
		getConversationDir: (conversationId: string) =>
			conversationStorage.getConversationDir(conversationId),
		getWorkspaceDir: (conversationId: string) =>
			conversationStorage.getWorkspaceDir(conversationId),
		updateConversationMetadata: (
			id: string,
			updates: Partial<ConversationSummary>,
		) => conversationStorage.updateConversationMetadata(id, updates),
	},

	// ─── Network ──────────────────────────────
	// channels: network:get-proxy-config, network:set-proxy-config, network:test-proxy,
	//           network:get-log-enabled, network:set-log-enabled, network:get-request-log,
	//           network:clear-request-log
	network: {
		getProxyConfig: () => proxyService.getConfig() ?? null,
		setProxyConfig: (config: ProxyConfig) => proxyService.updateConfig(config),
		testProxy: (config: ProxyConfig) => proxyService.testConnection(config),
		getLogEnabled: () => requestLogService.getEnabled(),
		setLogEnabled: (enabled: boolean) => requestLogService.setEnabled(enabled),
		getRequestLog: () => requestLogService.getEntries(),
		clearRequestLog: () => requestLogService.clearEntries(),
	},

	// ─── Model ────────────────────────────────
	// channels: model:list-providers, model:get-provider, model:save-provider,
	//           model:delete-provider, model:test-connection, model:fetch-models,
	//           model:update-model-config, model:get-active-model, model:set-active-model
	// ⚠️ LLM streaming channels (llm:chat-completion, llm:stop-stream, llm:tool-approval-response)
	//    仍在 modelHandlers.ts 手动注册
	model: {
		listProviders: () => storeManager.getModelProviders(),
		getProvider: (id: string) => {
			const provider = storeManager.getModelProvider(id);
			if (!provider) throw new Error("Provider not found");
			return provider;
		},
		saveProvider: (provider: ModelProvider) =>
			storeManager.saveModelProvider(provider),
		deleteProvider: (id: string) => storeManager.deleteModelProvider(id),
		testConnection: (baseUrl: string, apiKey: string) =>
			llmService.testConnection(baseUrl, apiKey),
		fetchModels: async (
			baseUrl: string,
			apiKey: string,
			preset?: ModelProviderPreset,
		) => {
			const models = await llmService.fetchModels(baseUrl, apiKey, preset);
			return { models };
		},
		updateModelConfig: (
			providerId: string,
			modelId: string,
			config: Record<string, unknown>,
		) => storeManager.updateModelConfig(providerId, modelId, config as any),
		getActiveModel: () => storeManager.getActiveModelSelection(),
		setActiveModel: (selection: ActiveModelSelection | null) =>
			storeManager.setActiveModelSelection(selection),
	},

	// ─── Skill ────────────────────────────────
	// channels: skill:list-skills, skill:install-skill, skill:uninstall-skill, skill:get-skill,
	//           skill:execute-skill, skill:get-system-prompt, skill:get-command-prompt,
	//           skill:validate-skill, skill:get-all-tools, skill:enable-skill, skill:disable-skill
	skill: {
		listSkills: () => getSkillService().listSkills(),
		installSkill: (source: string) => getSkillService().installSkill(source),
		uninstallSkill: (id: string) => getSkillService().uninstallSkill(id),
		getSkill: (id: string) => {
			const skill = getSkillService().getSkill(id);
			if (!skill) throw new Error("Skill not found");
			return skill;
		},
		executeSkill: (
			skillId: string,
			toolName: string,
			input: Record<string, unknown>,
		) => getSkillService().executeSkill(skillId, toolName, input),
		getSystemPrompt: (skillId: string) =>
			getSkillService().getSystemPrompt(skillId),
		getCommandPrompt: (skillId: string, commandName: string) =>
			getSkillService().getCommandPrompt(skillId, commandName),
		validateSkill: (source: string) =>
			getSkillService().validateSkill(source),
		getAllTools: () => getSkillService().getAllAvailableTools(),
		enableSkill: (id: string) => getSkillService().enableSkill(id),
		disableSkill: (id: string) => getSkillService().disableSkill(id),
	},
};

/**
 * 注册所有通过 Typed IPC Proxy 管理的 handlers
 */
export function registerProxyHandlers(): void {
	registerAPI(apiImpl);
}
