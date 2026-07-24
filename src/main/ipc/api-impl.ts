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

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
} from "fs";
import { promises as fsPromises } from "fs";
import os from "os";
import { basename, dirname, extname, join, relative, sep } from "path";
import * as path from "path";
import { execSync } from "child_process";
import v8 from "v8";
import { glob } from "tinyglobby";

import { registerAPI } from "./register";
import { broadcastEvent } from "./events";
import { toSessionContentRefReadResult } from "./sessionContentRef";

// ─── Services ──────────────────────────────
import { storeManager } from "../store/StoreManager";
import { webhookService } from "../services/market/WebhookService";
import { authService } from "../services/auth/AuthService";
import { conversationStorage } from "../services/chat/ConversationStorageService";
import { getApprovalGrantStore } from "../services/runtime/ApprovalGrantStore";
import { getAttachmentContextResolver } from "../services/runtime/AttachmentContextResolver";
import { getFileActionService } from "../services/runtime/FileActionService";
import { getGitInfoService } from "../services/runtime/GitInfoService";
import { getRuntimePolicyService } from "../services/runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../services/runtime/SessionRuntimeResolver";
import { getLegacyImporter } from "../services/storage/LegacyImporter";
import { getProjectStorage } from "../services/storage/ProjectStorageService";
import { getSessionStorage } from "../services/storage/SessionStorageService";
import { DiagnosticExportService } from "../services/diagnostics/DiagnosticExportService";
import { RecoveryBundleService } from "../services/recovery/RecoveryBundleService";
import { getAgentTraceCollector } from "../services/agent/trace/AgentTraceCollector";
import {
	resolveConversationCwd,
	resolveConversationProjectRoot,
} from "../services/runtime/conversationCwd";
import { appConfigService } from "../services/config/AppConfigService";
import { searchService } from "../services/search/SearchService";
import { getSkillService } from "../services/skill/SkillService";
import { proxyService } from "../services/network/ProxyService";
import { requestLogService } from "../services/network/RequestLogService";
import { llmService } from "../services/llm";
import { localServer } from "../server";
import { getOrCreateApiKey } from "../server/config";
import { logDatabaseService } from "../services/log";
import { updateService } from "../services/updateService";
import { getAgentRuntimeRegistry } from "../services/agent/runtime/AgentRuntimeRegistry";
import {
	BUILTIN_PROFILES,
	BUILTIN_TEAMS,
	BUILTIN_VERSION,
} from "../services/agent/builtinTeams";
import { mcpService } from "../services/mcp/McpService";
import { builtinMcpService } from "../services/mcp/BuiltinMcpService";
import { thirdPartyMcpService } from "../services/mcp/ThirdPartyMcpService";
import { mcpMarketService } from "../services/mcp/McpMarketService";
import {
	getPluginManager,
	resetPluginManager,
} from "../services/plugin/PluginManager";
import {
	BUILTIN_MARKET_PLUGINS,
	BUILTIN_PLUGIN_SOURCES,
} from "../services/plugin/builtin";
import { getExtensionDescriptorService } from "../services/extensions/ExtensionDescriptorService";

// ─── Service Holders ───────────────────────
import {
	getIMBotService,
	getRemoteDeviceService,
	getRemoteControlEventService,
	getRemoteChatBridge,
	getFloatingWindow,
	getFloatWidgetVisible,
	setFloatWidgetVisible,
	getLogViewerOpener,
} from "./service-holders";
import { logger } from "../utils/logger";

const log = logger.withContext("PluginHandlers");

// ─── Types ─────────────────────────────────
import type {
	WebhookConfig,
	SearchExecuteRequest,
	AuthProvider,
	ResolveSessionRuntimeInput,
	SessionApprovalGrant,
	ProxyConfig,
	ModelProvider,
	ModelProviderPreset,
	ActiveModelSelection,
	LogQueryParams,
	RendererLogEntry,
	McpServerConfig,
	McpMarketSearchParams,
	McpMarketItem,
	IMBotConfig,
	BotStatus,
	RelayConfig,
	AgentSDKConfig,
	AgentProfile,
	AgentTeam,
} from "./types";
import type {
	RuntimeOperationContext,
	WorkspaceRuntimePolicy,
} from "@super-client/shared-types/chat";
import type { SearchConfig, SearchProviderType } from "../store";

// ─── Helper Functions ──────────────────────

const PORT_MIN = 1024;
const PORT_MAX = 65535;

function validatePort(port: number): void {
	if (isNaN(port)) throw new Error("Port must be a number");
	if (!Number.isInteger(port)) throw new Error("Port must be an integer");
	if (port < PORT_MIN || port > PORT_MAX) {
		throw new Error(`Port must be between ${PORT_MIN} and ${PORT_MAX}`);
	}
}

const DEFAULT_PROJECT_RUNTIME_POLICY: WorkspaceRuntimePolicy = {
	approvalMode: "request",
	sandboxMode: "workspace-write",
	writableRoots: [],
	networkAccess: "approval-required",
	externalAppAccess: "approval-required",
};

function resolveProjectRuntimePolicy(
	projectId: string,
): WorkspaceRuntimePolicy {
	const settings = getProjectStorage().getSettings(projectId);
	const override = settings.runtimePolicy;
	return {
		approvalMode:
			override?.approvalMode ?? DEFAULT_PROJECT_RUNTIME_POLICY.approvalMode,
		sandboxMode:
			override?.sandboxMode ?? DEFAULT_PROJECT_RUNTIME_POLICY.sandboxMode,
		writableRoots:
			override?.writableRoots ?? DEFAULT_PROJECT_RUNTIME_POLICY.writableRoots,
		networkAccess:
			override?.networkAccess ?? DEFAULT_PROJECT_RUNTIME_POLICY.networkAccess,
		externalAppAccess:
			override?.externalAppAccess ??
			DEFAULT_PROJECT_RUNTIME_POLICY.externalAppAccess,
	};
}

/**
 * 从文件末尾高效读取最后 N 行
 */
async function readLastLines(
	filePath: string,
	lineCount: number,
): Promise<string> {
	const fs = await import("fs");
	const CHUNK_SIZE = 16384;

	return new Promise((resolve, reject) => {
		try {
			const fd = fs.openSync(filePath, "r");
			const stats = fs.fstatSync(fd);
			const fileSize = stats.size;

			if (fileSize === 0) {
				fs.closeSync(fd);
				resolve("");
				return;
			}

			if (fileSize <= CHUNK_SIZE) {
				const buffer = Buffer.alloc(fileSize);
				fs.readSync(fd, buffer, 0, fileSize, 0);
				fs.closeSync(fd);
				const lines = buffer.toString("utf-8").split("\n");
				resolve(lines.slice(-lineCount).join("\n"));
				return;
			}

			let position = fileSize;
			const chunks: Buffer[] = [];
			let totalBytes = 0;
			let foundLines = 0;

			while (position > 0 && foundLines <= lineCount) {
				const chunkSize = Math.min(CHUNK_SIZE, position);
				position -= chunkSize;
				const chunkBuffer = Buffer.alloc(chunkSize);
				fs.readSync(fd, chunkBuffer, 0, chunkSize, position);
				chunks.unshift(chunkBuffer);
				totalBytes += chunkSize;
				const currentContent = Buffer.concat(chunks).toString("utf-8");
				foundLines = currentContent.split("\n").length - 1;
				if (totalBytes >= 262144) break;
			}

			fs.closeSync(fd);
			const content = Buffer.concat(chunks).toString("utf-8");
			const lines = content.split("\n");
			const startIndex = position > 0 ? 1 : 0;
			resolve(lines.slice(startIndex).slice(-lineCount).join("\n"));
		} catch (err) {
			reject(err);
		}
	});
}

// ─── File attachment helpers ───────────────

function getAttachmentsDir(conversationId?: string): string {
	if (conversationId) {
		return conversationStorage.getAttachmentsDir(conversationId);
	}
	const dir = join(app.getPath("userData"), "attachments");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return dir;
}

function generateUniqueFileName(originalName: string): string {
	const ext = extname(originalName);
	const base = basename(originalName, ext);
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${base}_${timestamp}_${random}${ext}`;
}

const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".bmp",
	".svg",
];

function getFileType(
	mimeType: string,
): "image" | "document" | "code" | "audio" | "video" | "archive" | "other" {
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.startsWith("video/")) return "video";
	if (
		mimeType.includes("pdf") ||
		mimeType.includes("word") ||
		mimeType.includes("excel") ||
		mimeType.includes("text")
	)
		return "document";
	if (
		mimeType.includes("zip") ||
		mimeType.includes("rar") ||
		mimeType.includes("7z")
	)
		return "archive";
	if (
		mimeType.includes("javascript") ||
		mimeType.includes("typescript") ||
		mimeType.includes("json") ||
		mimeType.includes("html")
	)
		return "code";
	return "other";
}

function inferMimeType(ext: string): string {
	if (IMAGE_EXTENSIONS.includes(ext))
		return `image/${ext.replace(".", "").replace("jpg", "jpeg")}`;
	if (ext === ".pdf") return "application/pdf";
	if (ext === ".txt") return "text/plain";
	if (ext === ".md") return "text/markdown";
	if (ext === ".json") return "application/json";
	if (ext === ".js") return "application/javascript";
	if (ext === ".html") return "text/html";
	if (ext === ".css") return "text/css";
	return "application/octet-stream";
}

// ─── Plugin builtin presets merge ──────────

function mergeBuiltinPresets(): void {
	const storedVersion = storeManager.getBuiltinAgentVersion();
	if (storedVersion >= BUILTIN_VERSION) return;

	const existingProfiles = storeManager.getAgentProfiles();
	const builtinIds = new Set(BUILTIN_PROFILES.map((p) => p.id));
	const userProfiles = existingProfiles.filter((p) => !builtinIds.has(p.id));
	storeManager.setAgentProfiles([...BUILTIN_PROFILES, ...userProfiles]);

	const existingTeams = storeManager.getAgentTeams();
	const builtinTeamIds = new Set(BUILTIN_TEAMS.map((t) => t.id));
	const userTeams = existingTeams.filter((t) => !builtinTeamIds.has(t.id));
	storeManager.setAgentTeams([...BUILTIN_TEAMS, ...userTeams]);

	storeManager.setBuiltinAgentVersion(BUILTIN_VERSION);
}

// ════════════════════════════════════════════
// System memory helpers
// ════════════════════════════════════════════

// macOS 上 `os.freemem()` 与 Chromium 的 `process.getSystemMemoryInfo().free`
// 都只统计真正空闲页(free_count),不包含 inactive / speculative / purgeable
// 这些"可被立即回收"的页,导致进度条几乎永远 ≈ 100% 触发红色告警。
// 用 vm_stat 计算 macOS 的 available = free + inactive + speculative + purgeable。
// 结果缓存 1s,避免频繁 execSync。
let macMemCache: { at: number; totalMB: number; freeMB: number } | null = null;

function readMacAvailableMB(): { totalMB: number; freeMB: number } {
	const now = Date.now();
	if (macMemCache && now - macMemCache.at < 1000) {
		return { totalMB: macMemCache.totalMB, freeMB: macMemCache.freeMB };
	}
	try {
		const out = execSync("/usr/bin/vm_stat", { encoding: "utf8" });
		const pageSizeMatch = out.match(/page size of (\d+) bytes/);
		const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
		const pages = (label: string): number => {
			const m = out.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
			return m ? Number(m[1]) : 0;
		};
		const availablePages =
			pages("Pages free") +
			pages("Pages inactive") +
			pages("Pages speculative") +
			pages("Pages purgeable");
		const totalMB = Math.round(os.totalmem() / 1024 / 1024);
		const freeMB = Math.round((availablePages * pageSize) / 1024 / 1024);
		macMemCache = { at: now, totalMB, freeMB };
		return { totalMB, freeMB };
	} catch {
		return {
			totalMB: Math.round(os.totalmem() / 1024 / 1024),
			freeMB: Math.round(os.freemem() / 1024 / 1024),
		};
	}
}

// ════════════════════════════════════════════
// API Implementation
// ════════════════════════════════════════════

const apiImpl = {
	// ─── Webhook ──────────────────────────────
	webhook: {
		getConfigs: () => storeManager.getWebhookConfigs(),
		saveConfig: (config: WebhookConfig) =>
			storeManager.saveWebhookConfig(config),
		deleteConfig: (id: string) => storeManager.deleteWebhookConfig(id),
		test: (configId: string) => webhookService.test(configId),
	},

	// ─── Auth ─────────────────────────────────
	auth: {
		login: async (provider: AuthProvider) => {
			const user = await authService.login(provider);
			conversationStorage.setCurrentUser(user.id);
			return user;
		},
		logout: async () => {
			await authService.logout();
			conversationStorage.setCurrentUser(null);
		},
		getUser: () => authService.getUser(),
	},

	// ─── App Config ───────────────────────────
	appConfig: {
		getConfig: () => appConfigService.getConfig(),
		refresh: () => appConfigService.refresh(),
		// A-7 (S7) — §9.5 picker sticky
		getNewConversationDefaults: () => storeManager.getNewConversationDefaults(),
		setNewConversationDefaults: (value: {
			lastKind: "casual" | "project";
			lastProjectId?: string;
		}) => storeManager.setNewConversationDefaults(value),
	},

	// ─── Search ───────────────────────────────
	search: {
		execute: (request: SearchExecuteRequest) => searchService.execute(request),
		getConfigs: () => ({
			configs: storeManager.getSearchConfigs(),
			defaultProvider: storeManager.getDefaultSearchProvider(),
		}),
		saveConfig: (config: SearchConfig) => storeManager.saveSearchConfig(config),
		deleteConfig: (id: string) => storeManager.deleteSearchConfig(id),
		setDefault: (provider: SearchProviderType | null) =>
			storeManager.setDefaultSearchProvider(provider),
		getDefault: () => storeManager.getDefaultSearchProvider(),
		validateConfig: async (config: SearchConfig) => {
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
					error: error instanceof Error ? error.message : "Validation failed",
				};
			}
		},
	},

	// ─── Session Runtime ──────────────────────
	runtime: {
		resolveSession: (input: ResolveSessionRuntimeInput) =>
			getSessionRuntimeResolver().resolve(input),
		getAuditLog: (limit?: number) =>
			getRuntimePolicyService().getAuditLog(limit),
		clearAuditLog: () => {
			getRuntimePolicyService().clearAuditLog();
			return true;
		},
		findGrant: (
			conversationId: string,
			operationType: string,
			target?: string,
		) =>
			getApprovalGrantStore().findGrant({
				conversationId,
				operationType,
				target,
			}),
		addGrant: (
			conversationId: string,
			input: Omit<SessionApprovalGrant, "id" | "grantedAt">,
		) => getApprovalGrantStore().addGrant(conversationId, input),
		listGrants: (conversationId: string) =>
			getApprovalGrantStore().listGrants(conversationId),
		removeGrant: (conversationId: string, grantId: string) =>
			getApprovalGrantStore().removeGrant(conversationId, grantId),
		recordDeny: (
			conversationId: string,
			workspaceId: string,
			operationType: string,
			target?: string,
			reason?: string,
		) => {
			getApprovalGrantStore().recordDeny(
				conversationId,
				workspaceId,
				operationType,
				target,
				reason,
			);
			return true;
		},
		clearGrants: (conversationId: string) => {
			getApprovalGrantStore().clearGrants(conversationId);
			return true;
		},
	},

	// ─── Feature Flags（§22 rollback flags — renderer 主导，main 仅同步 enforcement 位）──
	featureFlags: {
		set: (flags: {
			unifiedNavigation: boolean;
			runtimeEnforcement: boolean;
			fileArtifacts: boolean;
			profileLayouts: boolean;
		}) => {
			getRuntimePolicyService().setEnforcementEnabled(
				!!flags.runtimeEnforcement,
			);
			return true;
		},
		get: () => ({
			runtimeEnforcement: getRuntimePolicyService().isEnforcementEnabled(),
		}),
	},

	// ─── Attachment Context Resolver（§14 minimal slice）──
	attachment: {
		resolveContext: (args: {
			conversationId: string;
			attachmentIds: string[];
			maxBytesPerAttachment?: number;
		}) => getAttachmentContextResolver().resolve(args),
	},

	// ─── File Action（policy-aware shell ops for chat file artifact UI）──
	fileAction: {
		open: (filePath: string, workspaceId?: string) =>
			getFileActionService().open(filePath, workspaceId ?? ""),
		reveal: (filePath: string, workspaceId?: string) =>
			getFileActionService().reveal(filePath, workspaceId ?? ""),
		copyPath: (filePath: string, workspaceId?: string) =>
			getFileActionService().copyPath(filePath, workspaceId ?? ""),
		detectOpenTargets: (filePath: string, workspaceId?: string) =>
			getFileActionService().detectOpenTargets(filePath, workspaceId ?? ""),
		openWith: (filePath: string, targetId: string, workspaceId?: string) =>
			getFileActionService().openWith(filePath, targetId, workspaceId ?? ""),
		getAppIcon: (appPath: string) =>
			getFileActionService().getAppIcon({ id: "", appPath }),
	},

	// ─── Network ──────────────────────────────
	network: {
		getProxyConfig: () => proxyService.getConfig() ?? null,
		setProxyConfig: (config: ProxyConfig) => proxyService.updateConfig(config),
		testProxy: (config: ProxyConfig) => proxyService.testConnection(config),
		getLogEnabled: () => requestLogService.getEnabled(),
		setLogEnabled: (enabled: boolean) => requestLogService.setEnabled(enabled),
		getRequestLog: () => requestLogService.getEntries(),
		clearRequestLog: () => requestLogService.clearEntries(),
	},

	// ─── Model (CRUD only, streaming in modelHandlers) ─
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
		validateSkill: (source: string) => getSkillService().validateSkill(source),
		getAllTools: () => getSkillService().getAllAvailableTools(),
		enableSkill: (id: string) => getSkillService().enableSkill(id),
		disableSkill: (id: string) => getSkillService().disableSkill(id),
	},

	// ─── API Server ───────────────────────────
	api: {
		getStatus: () => localServer.getStatus(),
		start: async () => {
			const status = localServer.getStatus();
			if (status.status === "running")
				throw new Error("Server is already running");
			await localServer.start();
			return localServer.getStatus();
		},
		stop: async () => {
			const status = localServer.getStatus();
			if (status.status === "stopped")
				throw new Error("Server is already stopped");
			await localServer.stop();
			return localServer.getStatus();
		},
		restart: async (port?: number) => {
			if (port !== undefined) {
				validatePort(port);
				storeManager.setConfig("apiPort", port);
			}
			await localServer.restart(port);
			return localServer.getStatus();
		},
		setPort: (port: number) => {
			validatePort(port);
			storeManager.setConfig("apiPort", port);
			return true;
		},
		getServerPort: () => localServer.getPort(),
		getApiKey: () => getOrCreateApiKey(),
	},

	// ─── Remote Control ───────────────────────
	remoteControl: {
		getEvents: () => getRemoteControlEventService().getEvents(),
		clearEvents: () => getRemoteControlEventService().clearEvents(),
		getConnectionInfo: () => getRemoteControlEventService().getConnectionInfo(),
	},

	// ─── IM Bot ───────────────────────────────
	imbot: {
		listBots: () => getIMBotService().getBotStatuses(),
		startBot: (config: IMBotConfig) => getIMBotService().startBot(config),
		stopBot: (botId: string) => getIMBotService().stopBot(botId),
		getBotStatus: (botId: string) => {
			const statuses = getIMBotService().getBotStatuses();
			return statuses.find((s: BotStatus) => s.id === botId) || null;
		},
		sendMessage: async (botId: string, chatId: string, content: string) => {
			const bot = getIMBotService()["bots"].get(botId);
			if (!bot) throw new Error("Bot not found or not running");
			await bot.sendMessage(chatId, content);
		},
	},

	// ─── Remote Chat ──────────────────────────
	remoteChat: {
		bind: (conversationId: string, botId: string, chatId: string) =>
			getRemoteChatBridge().bind(conversationId, botId, chatId),
		unbind: (conversationId: string) =>
			getRemoteChatBridge().unbind(conversationId),
		getBinding: (conversationId: string) =>
			getRemoteChatBridge().getBinding(conversationId) || null,
		checkBotOnline: (botId: string) =>
			getRemoteChatBridge().checkBotOnline(botId),
		sendMessage: (conversationId: string, content: string) =>
			getRemoteChatBridge().sendMessage(conversationId, content),
		getRemoteMessages: (conversationId: string) =>
			getRemoteChatBridge().getRemoteMessages(conversationId),
		listBindings: () => getRemoteChatBridge().listBindingsWithLifecycle(),
	},

	// ─── Remote Device ────────────────────────
	remoteDevice: {
		listDevices: () => getRemoteDeviceService().listDevices(),
		registerDevice: async (req: {
			name: string;
			platform: "linux" | "windows" | "macos";
			tags?: string[];
			description?: string;
		}) => {
			const { nanoid } = await import("nanoid");
			const device = getRemoteDeviceService().registerDevice({
				id: nanoid(),
				name: req.name,
				platform: req.platform,
				tags: req.tags,
				description: req.description,
			});
			storeManager.saveRemoteDevice(device);
			return device;
		},
		removeDevice: (deviceId: string) => {
			const success = getRemoteDeviceService().removeDevice(deviceId);
			if (success) storeManager.deleteRemoteDevice(deviceId);
			return success;
		},
		getDevice: (deviceId: string) =>
			getRemoteDeviceService().getDevice(deviceId) || null,
		executeCommand: (deviceId: string, command: string, timeout?: number) =>
			getRemoteDeviceService().executeCommand(deviceId, command, timeout),
		killCommand: (deviceId: string, requestId: string) =>
			getRemoteDeviceService().killCommand(deviceId, requestId),
		tabComplete: (deviceId: string, line: string, cursorPos: number) =>
			getRemoteDeviceService().tabComplete(deviceId, line, cursorPos),
		getCwd: (deviceId: string) => getRemoteDeviceService().getCwd(deviceId),
		getRelayConfig: () => storeManager.getRelayConfig() || null,
		setRelayConfig: async (config: RelayConfig) => {
			storeManager.setRelayConfig(config);
			await getRemoteDeviceService().switchMode(config);
		},
	},

	// ─── Window Control ───────────────────────
	window: {
		minimize: () => {
			BrowserWindow.getFocusedWindow()?.minimize();
		},
		maximize: () => {
			const win = BrowserWindow.getFocusedWindow();
			if (win) {
				if (win.isMaximized()) win.unmaximize();
				else win.maximize();
			}
		},
		close: () => {
			BrowserWindow.getFocusedWindow()?.close();
		},
		isMaximized: () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false,
	},

	// ─── Float Widget ─────────────────────────
	floatWidget: {
		show: () => {
			setFloatWidgetVisible(true);
			storeManager.setConfig("floatWidgetEnabled", true);
			getFloatingWindow()?.show();
		},
		hide: () => {
			setFloatWidgetVisible(false);
			storeManager.setConfig("floatWidgetEnabled", false);
			getFloatingWindow()?.hide();
		},
		getStatus: () => ({ visible: getFloatWidgetVisible() }),
	},

	// ─── Log ──────────────────────────────────
	log: {
		query: (params: LogQueryParams) => logDatabaseService.query(params),
		getStats: () => logDatabaseService.getStats(),
		getModules: () => logDatabaseService.getModules(),
		rendererLog: (entry: RendererLogEntry) => {
			logDatabaseService.insert({
				timestamp: new Date().toISOString(),
				level: entry.level,
				module: entry.module || "Renderer",
				process: "renderer",
				message: entry.message,
				meta: entry.meta,
				error_message: entry.error_message,
				error_stack: entry.error_stack,
			});
		},
		clearDb: () => logDatabaseService.clear(),
		exportLogs: async (params: LogQueryParams) => {
			const result = await dialog.showSaveDialog({
				title: "导出日志",
				defaultPath: `logs-export-${new Date().toISOString().slice(0, 10)}.json`,
				filters: [{ name: "JSON", extensions: ["json"] }],
			});
			if (result.canceled || !result.filePath) return null;
			const exportResult = logDatabaseService.exportToFile(
				params,
				result.filePath,
			);
			return { count: exportResult.count, filePath: result.filePath };
		},
		openViewer: () => {
			getLogViewerOpener()?.();
		},
	},

	// ─── App ──────────────────────────────────
	app: {
		getInfo: () => ({
			name: app.getName(),
			version: app.getVersion(),
			electron: process.versions.electron,
			node: process.versions.node,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
		}),
		getUserDataPath: () => app.getPath("userData"),
		openPath: async (p: string) => {
			if (!p) throw new Error("Path is required");
			const error = await shell.openPath(p);
			if (error) throw new Error(error);
			return true;
		},
		/**
		 * F-2: 在系统文件管理器中"显示并选中"指定路径（macOS Finder / Windows
		 * Explorer / Linux 默认）。区别于 `openPath`：openPath 会直接打开（目录就
		 * 进目录、文件就用默认 app 打开），showInFolder 总是定位到父目录并选中。
		 */
		showInFolder: async (p: string) => {
			if (!p) throw new Error("Path is required");
			if (!existsSync(p)) {
				throw new Error(`Path does not exist: ${p}`);
			}
			shell.showItemInFolder(p);
			return true;
		},
		checkUpdate: () => updateService.checkForUpdates(),
		quit: () => app.quit(),
		relaunch: () => {
			app.relaunch();
			app.exit(0);
		},
		getLogsPath: () => join(app.getPath("userData"), "logs"),
		listLogFiles: async () => {
			const logsDir = join(app.getPath("userData"), "logs");
			if (!existsSync(logsDir)) return [];
			try {
				const entries = await fsPromises.readdir(logsDir, {
					withFileTypes: true,
				});
				const files = await Promise.all(
					entries
						.filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
						.map(async (entry) => {
							const filePath = join(logsDir, entry.name);
							const stats = await fsPromises.stat(filePath);
							return {
								name: entry.name,
								path: filePath,
								size: stats.size,
								createdAt: stats.birthtime.toISOString(),
								modifiedAt: stats.mtime.toISOString(),
							};
						}),
				);
				return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
			} catch {
				return [];
			}
		},
		getLogs: async (filePath?: string, tail?: number) => {
			const logsDir = join(app.getPath("userData"), "logs");
			let targetFile = filePath;
			if (!targetFile) {
				if (!existsSync(logsDir)) return "";
				const files = readdirSync(logsDir)
					.filter((f) => f.endsWith(".log"))
					.sort()
					.reverse();
				if (files.length === 0) return "";
				targetFile = join(logsDir, files[0]);
			}
			if (!existsSync(targetFile)) return "";
			const lineCount = tail && tail > 0 ? tail : 500;
			return readLastLines(targetFile, lineCount);
		},
		clearLogs: async () => {
			const logsDir = join(app.getPath("userData"), "logs");
			if (!existsSync(logsDir)) return true;
			try {
				const entries = await fsPromises.readdir(logsDir, {
					withFileTypes: true,
				});
				const files = entries
					.filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
					.map((entry) => join(logsDir, entry.name));
				await Promise.all(
					files.map((fp) => fsPromises.unlink(fp).catch(() => {})),
				);
				return true;
			} catch {
				return false;
			}
		},
		openExternal: async (url: string) => {
			if (!url) throw new Error("URL is required");
			await shell.openExternal(url);
			return true;
		},
		getConfig: (key: string) => storeManager.getConfig(key as any),
		setConfig: (key: string, value: unknown) => {
			storeManager.setConfig(key as any, value);
			return true;
		},
	},

	// ─── Theme ────────────────────────────────
	theme: {
		get: () => storeManager.getConfig("theme") || "auto",
		set: (themeMode: string) => {
			storeManager.setConfig("theme", themeMode as "light" | "dark" | "auto");
			broadcastEvent("theme:change", themeMode);
			return true;
		},
	},

	// ─── System ───────────────────────────────
	system: {
		getHomedir: () => os.homedir(),
		getEnvInfo: () => ({
			os: `${os.type()} ${os.release()}`,
			platform: process.platform,
			arch: process.arch,
			nodeVersion: process.versions.node,
			electronVersion: process.versions.electron,
			v8Version: process.versions.v8,
			homedir: os.homedir(),
			cwd: os.homedir(),
			appVersion: app.getVersion(),
			locale: app.getLocale(),
		}),
		getProcessMetrics: () => {
			const mem = process.memoryUsage();
			const cpuUsage = process.cpuUsage();
			// 系统内存:
			//   - macOS: 用 vm_stat 计算 available (free + inactive + speculative + purgeable)
			//     Chromium 的 `getSystemMemoryInfo().free` 与 Node 的 `os.freemem()` 只算真正空闲页,
			//     结果在 macOS 上几乎永远 ≈ 0 (系统会把闲置页做磁盘缓存),让进度条永远飘红。
			//   - Linux (Node 18+): os.freemem() 已经返回 MemAvailable,可直接用
			//   - Windows: os.freemem() 返回可用物理内存
			const { totalMB: systemTotalMB, freeMB: systemFreeMB } =
				process.platform === "darwin"
					? readMacAvailableMB()
					: {
							totalMB: Math.round(os.totalmem() / 1024 / 1024),
							freeMB: Math.round(os.freemem() / 1024 / 1024),
						};
			// 堆内存分母用 V8 的 heap_size_limit(V8 允许老生代增长到的上限,通常 ≈ 4 GB),
			// 而不是 mem.heapTotal——后者是"当前已分配"的堆,会随需要动态增长,
			// heapUsed / heapTotal 几乎永远接近 1,失去警戒意义。
			const heapStats = v8.getHeapStatistics();
			return {
				heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
				heapTotal: Math.round(heapStats.heap_size_limit / 1024 / 1024),
				rss: Math.round(mem.rss / 1024 / 1024),
				systemTotal: systemTotalMB,
				systemFree: systemFreeMB,
				cpuCores: os.cpus().length,
				cpuModel: os.cpus()[0]?.model || "N/A",
				cpuUser: cpuUsage.user,
				cpuSystem: cpuUsage.system,
				uptime: Math.round(process.uptime()),
				pid: process.pid,
			};
		},
	},

	// ─── Update ───────────────────────────────
	update: {
		check: () => updateService.checkForUpdates(),
		download: () => updateService.downloadUpdate(),
		install: () => updateService.quitAndInstall(),
	},

	// ─── File ─────────────────────────────────
	file: {
		selectFiles: async (options?: {
			multiple?: boolean;
			filters?: { name: string; extensions: string[] }[];
		}) => {
			const result = await dialog.showOpenDialog({
				properties: options?.multiple
					? ["openFile", "multiSelections"]
					: ["openFile"],
				filters: options?.filters || [
					{ name: "所有文件", extensions: ["*"] },
					{
						name: "图片",
						extensions: ["jpg", "jpeg", "png", "gif", "webp"],
					},
					{
						name: "文档",
						extensions: ["pdf", "doc", "docx", "txt", "md"],
					},
					{
						name: "代码",
						extensions: ["js", "ts", "json", "html", "css", "py"],
					},
				],
			});
			if (result.canceled || !result.filePaths.length) return [];
			return result.filePaths.map((fp) => {
				const stats = statSync(fp);
				const ext = extname(fp).toLowerCase();
				return {
					path: fp,
					name: basename(fp),
					size: stats.size,
					mimeType: inferMimeType(ext),
				};
			});
		},
		readFile: (
			filePath: string,
			options?: { encoding?: BufferEncoding; maxSize?: number },
		) => {
			if (!existsSync(filePath)) throw new Error("文件不存在");
			const stats = statSync(filePath);
			const maxSize = options?.maxSize || 10 * 1024 * 1024;
			if (stats.size > maxSize) throw new Error("文件过大");
			const encoding = options?.encoding || "utf-8";
			const content = readFileSync(filePath, { encoding });
			return { content, size: stats.size };
		},
		saveAttachment: (data: {
			sourcePath: string;
			conversationId?: string;
			messageId?: string;
			customName?: string;
		}) => {
			const { sourcePath, conversationId, messageId, customName } = data;
			if (!existsSync(sourcePath)) throw new Error("源文件不存在");
			const attachmentsDir = getAttachmentsDir(conversationId);
			const originalName = customName || basename(sourcePath);
			const uniqueName = generateUniqueFileName(originalName);
			const targetPath = join(attachmentsDir, uniqueName);
			copyFileSync(sourcePath, targetPath);
			const stats = statSync(targetPath);
			const ext = extname(originalName).toLowerCase();
			const mimeType = inferMimeType(ext);
			return {
				id: uniqueName.replace(extname(uniqueName), ""),
				name: uniqueName,
				originalName,
				path: targetPath,
				size: stats.size,
				mimeType,
				type: getFileType(mimeType),
				createdAt: new Date().toISOString(),
				conversationId,
				messageId,
			};
		},
		saveAttachmentBytes: async (data: {
			bytes: ArrayBuffer | Uint8Array;
			fileName: string;
			mimeType?: string;
			conversationId?: string;
			messageId?: string;
		}) => {
			const { bytes, fileName, mimeType, conversationId, messageId } = data;
			const attachmentsDir = getAttachmentsDir(conversationId);
			const originalName = fileName || "file";
			const uniqueName = generateUniqueFileName(originalName);
			const targetPath = join(attachmentsDir, uniqueName);
			const buffer =
				bytes instanceof Uint8Array
					? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
					: Buffer.from(bytes);
			await fsPromises.writeFile(targetPath, buffer);
			const stats = statSync(targetPath);
			const ext = extname(originalName).toLowerCase();
			const resolvedMime = mimeType || inferMimeType(ext);
			return {
				id: uniqueName.replace(extname(uniqueName), ""),
				name: uniqueName,
				originalName,
				path: targetPath,
				size: stats.size,
				mimeType: resolvedMime,
				type: getFileType(resolvedMime),
				createdAt: new Date().toISOString(),
				conversationId,
				messageId,
			};
		},
		deleteAttachment: async (attachmentPath: string) => {
			if (existsSync(attachmentPath)) {
				await fsPromises.unlink(attachmentPath);
			}
		},
		listAttachments: (filter?: { conversationId?: string }) => {
			const attachmentsDir = getAttachmentsDir(filter?.conversationId);
			if (!existsSync(attachmentsDir)) return [];
			const files = readdirSync(attachmentsDir);
			const attachments = files
				.map((file) => {
					const filePath = join(attachmentsDir, file);
					const stats = statSync(filePath);
					if (!stats.isFile()) return null;
					const ext = extname(file).toLowerCase();
					const mimeType = inferMimeType(ext);
					return {
						id: file.replace(ext, ""),
						name: file,
						originalName: file,
						path: filePath,
						size: stats.size,
						mimeType,
						type: getFileType(mimeType),
						createdAt: stats.birthtime.toISOString(),
					};
				})
				.filter(Boolean);
			attachments.sort(
				(a: any, b: any) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
			return attachments;
		},
		openAttachment: async (attachmentPath: string) => {
			if (!existsSync(attachmentPath)) throw new Error("文件不存在");
			const error = await shell.openPath(attachmentPath);
			if (error) throw new Error(error);
		},
		getAttachmentPath: () => getAttachmentsDir(),
		copyFile: (filePath: string) => {
			if (!existsSync(filePath)) throw new Error("文件不存在");
			return true;
		},
	},

	// ─── Agent SDK (RPC only; streaming via legacy compat in
	//     streamingHandlers → llm-loop runtime) ─
	//
	// After the legacy AgentSDKService removal (Phase D), only the few
	// methods the renderer actually invokes remain wired:
	//   - interrupt: forwarded to runtime.interrupt
	//   - resolvePermission: forwarded to runtime.resolvePermission
	//   - getConfig / setConfig / getProfiles / setProfiles / getTeams /
	//     setTeams: storeManager-backed; unchanged
	// Everything else throws "deprecated" so accidental callers fail loudly.
	agentSDK: {
		interrupt: async (requestId: string) => {
			const runtime = getAgentRuntimeRegistry()?.tryGet("llm-loop");
			if (runtime) await runtime.interrupt(requestId);
			return true;
		},
		close: async (_requestId: string) => {
			// No-op after legacy removal; interrupt subsumes close semantics.
			return true;
		},
		listSessions: async (_dir?: string) => {
			// Native-session listing was a Claude SDK feature; new runtime has
			// no native sessions.
			return [];
		},
		getSessionInfo: async (_sessionId: string) => null,
		setModel: async (_requestId: string, _model: string) => {
			// No live model swap on llm-loop; configured at request start.
			return false;
		},
		resolvePermission: async (
			toolUseId: string,
			allowed: boolean,
			_updatedInput?: Record<string, unknown>,
			_updatedPermissions?: Array<Record<string, unknown>>,
		) => {
			const runtime = getAgentRuntimeRegistry()?.tryGet("llm-loop");
			if (!runtime) return false;
			await runtime.resolvePermission(toolUseId, {
				approved: allowed,
				scope: "once",
			});
			return true;
		},
		forkSession: async (_sessionId: string, _dir?: string) => null,
		renameSession: async (
			_sessionId: string,
			_title: string,
			_dir?: string,
		) => false,
		tagSession: async (_sessionId: string, _tag: string, _dir?: string) =>
			false,
		getSessionMessages: async (_sessionId: string, _dir?: string) => [],
		getConfig: () => storeManager.getAgentSDKConfig(),
		setConfig: (config: AgentSDKConfig) =>
			storeManager.setAgentSDKConfig(config),
		getProfiles: () => storeManager.getAgentProfiles(),
		setProfiles: (profiles: AgentProfile[]) =>
			storeManager.setAgentProfiles(profiles),
		getTeams: () => storeManager.getAgentTeams(),
		setTeams: (teams: AgentTeam[]) => storeManager.setAgentTeams(teams),
	},

	// ─── MCP ──────────────────────────────────
	mcp: {
		connect: (id: string) => mcpService.connect(id),
		disconnect: (id: string) => mcpService.disconnect(id),
		listServers: () => mcpService.listServers(),
		getTools: (id: string) => mcpService.getServerTools(id),
		addServer: (config: McpServerConfig) => mcpService.addServer(config),
		removeServer: (id: string) => mcpService.removeServer(id),
		getAllStatus: () => mcpService.getAllServerStatus(),
		updateServer: (id: string, config: Partial<McpServerConfig>) =>
			mcpService.updateServer(id, config),
		callTool: (
			serverId: string,
			toolName: string,
			args: Record<string, unknown>,
		) => mcpService.callTool(serverId, toolName, args),
		getAllTools: () => mcpService.getAllAvailableTools(),
	},

	// ─── MCP Builtin ─────────────────────────
	mcpBuiltin: {
		getDefinitions: () => builtinMcpService.getAllDefinitions(),
		createConfig: (definitionId: string, config?: Record<string, unknown>) => {
			const serverConfig = builtinMcpService.createServerConfig(
				definitionId,
				config,
			);
			if (!serverConfig) throw new Error("Definition not found");
			return serverConfig;
		},
		search: (params: { keyword?: string; tags?: string[] }) => {
			if (params.keyword)
				return builtinMcpService.searchByKeyword(params.keyword);
			if (params.tags) return builtinMcpService.searchByTags(params.tags);
			return builtinMcpService.getAllDefinitions();
		},
	},

	// ─── MCP Third Party ─────────────────────
	mcpThirdparty: {
		add: (config: McpServerConfig) => {
			mcpService.addServer({ ...config, type: "third-party" as const });
		},
		proxy: (
			serverId: string,
			request: {
				endpoint: string;
				method: "GET" | "POST" | "PUT" | "DELETE";
				body?: unknown;
				headers?: Record<string, string>;
			},
		) => thirdPartyMcpService.proxyRequest(serverId, request),
	},

	// ─── MCP Market ──────────────────────────
	mcpMarket: {
		search: (params: McpMarketSearchParams) => mcpMarketService.search(params),
		popular: (limit?: number) => mcpMarketService.getPopular(limit),
		topRated: (limit?: number) => mcpMarketService.getTopRated(limit),
		newest: (limit?: number) => mcpMarketService.getNewest(limit),
		getDetail: (id: string) => mcpMarketService.getDetail(id),
		getTags: () => mcpMarketService.getTags(),
		install: async (
			marketItem: McpMarketItem,
			customConfig?: {
				name?: string;
				env?: Record<string, string>;
				url?: string;
			},
		) => {
			const config = await mcpMarketService.install(marketItem, customConfig);
			mcpService.addServer(config);
			return config;
		},
		getReadme: (marketItem: McpMarketItem) =>
			mcpMarketService.getReadme(marketItem),
		setApiUrl: (_url: string) => {
			/* reserved for compatibility */
		},
	},

	// ─── Plugin ───────────────────────────────
	plugin: {
		getAllPlugins: () => getPluginManager().getAllPlugins(),
		getPlugin: (pluginId: string) => {
			const plugin = getPluginManager().getPlugin(pluginId);
			if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
			return plugin;
		},
		installPlugin: async (sourcePath?: string) => {
			let targetPath = sourcePath;
			if (!targetPath) {
				const result = await dialog.showOpenDialog({
					properties: ["openDirectory"],
					title: "选择插件目录",
					buttonLabel: "安装插件",
				});
				if (result.canceled || result.filePaths.length === 0)
					throw new Error("Installation cancelled");
				targetPath = result.filePaths[0];
			}
			return getPluginManager().installPlugin(targetPath);
		},
		uninstallPlugin: (pluginId: string) =>
			getPluginManager().uninstallPlugin(pluginId),
		enablePlugin: (pluginId: string) =>
			getPluginManager().enablePlugin(pluginId),
		disablePlugin: (pluginId: string) =>
			getPluginManager().disablePlugin(pluginId),
		activatePlugin: (pluginId: string) =>
			getPluginManager().activatePlugin(pluginId),
		deactivatePlugin: (pluginId: string) =>
			getPluginManager().deactivatePlugin(pluginId),
		searchMarket: (query?: string, category?: string) => {
			const pm = getPluginManager();
			let results = [...BUILTIN_MARKET_PLUGINS];
			const installedPlugins = pm.getAllPlugins();
			const installedIds = new Set(installedPlugins.map((p) => p.id));
			results = results.map((p) => ({
				...p,
				installed: installedIds.has(p.id),
			}));
			if (query) {
				const lq = query.toLowerCase();
				results = results.filter(
					(p) =>
						p.name.toLowerCase().includes(lq) ||
						p.displayName.toLowerCase().includes(lq) ||
						p.description.toLowerCase().includes(lq),
				);
			}
			if (category) {
				results = results.filter((p) => p.categories.includes(category));
			}
			return results;
		},
		getMarketPlugin: (pluginId: string) => {
			const plugin = BUILTIN_MARKET_PLUGINS.find((p) => p.id === pluginId);
			if (!plugin) throw new Error("Plugin not found in market");
			const installed = getPluginManager()
				.getAllPlugins()
				.some((p) => p.id === pluginId);
			return { ...plugin, installed };
		},
		downloadPlugin: async (pluginId: string) => {
			const pluginData = BUILTIN_MARKET_PLUGINS.find((p) => p.id === pluginId);
			if (!pluginData) throw new Error("Plugin not found in market");
			const existing = getPluginManager().getPlugin(pluginId);
			if (existing) throw new Error("Plugin is already installed");

			const tmpDir = path.join(
				app.getPath("temp"),
				`plugin-install-${pluginId}-${Date.now()}`,
			);
			await fsPromises.mkdir(tmpDir, { recursive: true });

			const builtinSource =
				BUILTIN_PLUGIN_SOURCES[pluginId as keyof typeof BUILTIN_PLUGIN_SOURCES];
			if (builtinSource) {
				await fsPromises.writeFile(
					path.join(tmpDir, "package.json"),
					JSON.stringify(builtinSource.manifest, null, 2),
					"utf-8",
				);
				await fsPromises.writeFile(
					path.join(tmpDir, "index.js"),
					builtinSource.source,
					"utf-8",
				);
				if (builtinSource.extraFiles) {
					for (const [fileName, content] of Object.entries(
						builtinSource.extraFiles,
					)) {
						await fsPromises.writeFile(
							path.join(tmpDir, fileName),
							content,
							"utf-8",
						);
					}
				}
			} else {
				const manifest = {
					name: pluginData.id,
					displayName: pluginData.displayName,
					version: pluginData.version,
					description: pluginData.description,
					author: pluginData.author,
					main: "index.js",
					categories: pluginData.categories,
					engines: { "super-client-r": "^1.0.0" },
				};
				await fsPromises.writeFile(
					path.join(tmpDir, "package.json"),
					JSON.stringify(manifest, null, 2),
					"utf-8",
				);
				const entryCode = `"use strict";
module.exports = {
  activate(context) {
    console.log("[${pluginData.displayName}] Plugin activated");
  },
  deactivate() {
    console.log("[${pluginData.displayName}] Plugin deactivated");
  }
};
`;
				await fsPromises.writeFile(
					path.join(tmpDir, "index.js"),
					entryCode,
					"utf-8",
				);
			}

			const plugin = await getPluginManager().installPlugin(tmpDir);
			await fsPromises
				.rm(tmpDir, { recursive: true, force: true })
				.catch(() => {});
			return plugin;
		},
		getCommands: (pluginId?: string) =>
			getPluginManager().getRegisteredCommands(pluginId),
		executeCommand: (command: string, args?: unknown[]) =>
			getPluginManager().executeCommand(command, ...(args || [])),
		getStorage: (pluginId: string, key: string) => {
			const pluginsData = storeManager.getConfig("pluginsData") || {};
			return (pluginsData as Record<string, unknown>)[`${pluginId}.${key}`];
		},
		setStorage: (pluginId: string, key: string, value: unknown) => {
			const pluginsData =
				(storeManager.getConfig("pluginsData") as Record<string, unknown>) ||
				{};
			pluginsData[`${pluginId}.${key}`] = value;
			storeManager.setConfig("pluginsData", pluginsData);
		},
		deleteStorage: (pluginId: string, key: string) => {
			const pluginsData =
				(storeManager.getConfig("pluginsData") as Record<string, unknown>) ||
				{};
			delete pluginsData[`${pluginId}.${key}`];
			storeManager.setConfig("pluginsData", pluginsData);
		},
		getKeybindings: () => storeManager.getConfig("keybindings") || {},
		setKeybindings: (keybindings: Record<string, string>) =>
			storeManager.setConfig("keybindings", keybindings),
		getActiveSkin: () => getPluginManager().getActiveSkinId(),
		setActiveSkin: async (pluginId: string | null, themeId?: string) => {
			const pm = getPluginManager();
			if (pluginId === null) {
				await pm.removeSkinCSS();
				return;
			}
			if (!themeId) throw new Error("themeId is required");
			const pluginInfo = pm.getPlugin(pluginId);
			if (!pluginInfo) throw new Error(`Plugin ${pluginId} not found`);
			if (!pm.isSkinPlugin(pluginInfo))
				throw new Error(`Plugin ${pluginId} is not a skin plugin`);
			if (!pm.isPluginActive(pluginId)) await pm.enablePlugin(pluginId);
			await pm.applySkinCSS(pluginInfo, themeId);
		},
		getActiveMarkdownTheme: () => getPluginManager().getActiveMarkdownThemeId(),
		setActiveMarkdownTheme: async (
			pluginId: string | null,
			themeId?: string,
		) => {
			const pm = getPluginManager();
			if (pluginId === null) {
				await pm.removeMarkdownCSS();
				return;
			}
			if (!themeId) throw new Error("themeId is required");
			const pluginInfo = pm.getPlugin(pluginId);
			if (!pluginInfo) throw new Error(`Plugin ${pluginId} not found`);
			if (!pm.isMarkdownThemePlugin(pluginInfo))
				throw new Error(`Plugin ${pluginId} is not a markdown theme plugin`);
			if (!pm.isPluginActive(pluginId)) await pm.enablePlugin(pluginId);
			await pm.applyMarkdownCSS(pluginInfo, themeId);
		},
		getMarkdownThemeCSS: () => getPluginManager().getActiveMarkdownThemeCSS(),
		grantPermissions: (pluginId: string, permissions: string[]) =>
			getPluginManager().grantPermissions(pluginId, permissions as any),
		getPermissions: (pluginId: string) =>
			getPluginManager().getPermissions(pluginId),
		getUIContributions: () =>
			getPluginManager().uiContributionRegistry.getAllContributions(),
		getPluginPageHTML: async (pluginId: string, pagePath: string) => {
			const pm = getPluginManager();
			const pages = pm.uiContributionRegistry.getAllPages();
			const page = pages.find(
				(p) =>
					p.pluginId === pluginId && (p.path === pagePath || p.id === pagePath),
			);
			if (!page) throw new Error("Page not found");
			const pluginInfo = pm.getPlugin(pluginId);
			if (!pluginInfo) throw new Error("Plugin not found");
			const htmlPath = path.join(pluginInfo.path, page.htmlFile);
			const content = await fsPromises.readFile(htmlPath, "utf-8");
			return { html: content, title: page.title };
		},
		installDev: (sourcePath: string) =>
			getPluginManager().installDev(sourcePath),
		reloadDev: (pluginId: string) => getPluginManager().reloadDev(pluginId),
		checkUpdates: () => getPluginManager().checkForUpdates(),
		updatePlugin: (pluginId: string) =>
			getPluginManager().updatePlugin(pluginId),
	},

	// ─── Extensions（§20 统一只读视图）───────────
	extensions: {
		list: () => getExtensionDescriptorService().list(),
	},

	// ─── Git（read-only branch info via `git` CLI + checkout）─
	git: {
		getBranchInfo: (cwd: string) => getGitInfoService().getBranchInfo(cwd),
		createWorktree: (cwd: string, worktreePath: string, branchName?: string) =>
			getGitInfoService().createWorktree(cwd, worktreePath, branchName),
		preflightCreateWorktree: (
			cwd: string,
			worktreePath: string,
			branchName?: string,
		) =>
			getGitInfoService().preflightCreateWorktree(
				cwd,
				worktreePath,
				branchName,
			),
		listBranches: (cwd: string) => getGitInfoService().listBranches(cwd),
		switchBranch: (cwd: string, branch: string) =>
			getGitInfoService().switchBranch(cwd, branch),
		createBranch: (cwd: string, branch: string) =>
			getGitInfoService().createBranch(cwd, branch),
		listCommits: (cwd: string, opts?: { limit?: number }) =>
			getGitInfoService().listCommits(cwd, opts ?? {}),
	},

	// ─── Projects（A-6: project-session-redesign）─
	projects: {
		list: () => getProjectStorage().list(),
		add: (cwd: string, name?: string) => getProjectStorage().add(cwd, name),
		/**
		 * Open a native directory picker and register the chosen path as a project.
		 * Returns null when the user cancels; otherwise returns the new/existing project.
		 */
		pickAndAdd: async (name?: string) => {
			const result = await dialog.showOpenDialog({
				properties: ["openDirectory", "createDirectory"],
				title: "选择项目目录",
				buttonLabel: "添加项目",
			});
			if (result.canceled || result.filePaths.length === 0) return null;
			return getProjectStorage().add(result.filePaths[0], name);
		},
		rename: (id: string, name: string) => getProjectStorage().rename(id, name),
		pin: (id: string, pinned: boolean) => getProjectStorage().pin(id, pinned),
		markFirstRunSeen: (id: string) => getProjectStorage().markFirstRunSeen(id),
		archive: (id: string, archived: boolean) =>
			getProjectStorage().archive(id, archived),
		/**
		 * F-2 / F-9: 在源项目 cwd 下 `git worktree add`，成功后把新 cwd 也注册成项目。
		 * 失败回滚 worktree 创建，避免脏 git 状态。
		 */
		createWorktree: async (
			sourceId: string,
			opts: { worktreePath: string; branchName?: string },
		) => {
			const ps = getProjectStorage();
			const source = ps.list().find((p) => p.id === sourceId);
			if (!source) {
				throw new Error(`source project not found: ${sourceId}`);
			}
			const branch = opts.branchName ?? `worktree-${Date.now()}`;
			const op: RuntimeOperationContext = {
				workspaceId: sourceId,
				source: "user",
				operation: "git.worktree.add",
				kind: "command-exec",
				target: opts.worktreePath,
				input: { cwd: source.cwd, branch },
			};
			const policy = resolveProjectRuntimePolicy(sourceId);
			const evaluation = getRuntimePolicyService().evaluate(op, policy);
			if (
				evaluation.decision === "deny" ||
				evaluation.decision === "needs-approval"
			) {
				getRuntimePolicyService().record(op, "denied", evaluation.reason);
				const err = new Error(
					evaluation.reason ?? "runtime-policy-denied",
				) as Error & { code?: string; details?: Record<string, unknown> };
				err.code = evaluation.code ?? "runtime.commandNeedsApproval";
				err.details = { messageKey: err.code, target: opts.worktreePath };
				throw err;
			}
			const wt = await getGitInfoService().createWorktree(
				source.cwd,
				opts.worktreePath,
				branch,
			);
			if (!wt.ok || !wt.worktreePath) {
				throw new Error(wt.error ?? "git worktree add failed");
			}
			try {
				return ps.add(wt.worktreePath, undefined, {
					lineage: {
						kind: "worktree-of",
						sourceProjectId: sourceId,
						branch,
					},
				});
			} catch (err) {
				// 回滚：尝试 git worktree remove，避免脏状态（best-effort）
				try {
					await getGitInfoService().removeWorktree(source.cwd, wt.worktreePath);
				} catch {
					// best effort
				}
				throw err;
			}
		},
		remove: (id: string, opts?: { keepFiles?: boolean }) =>
			getProjectStorage().remove(id, opts),
		getSettings: (id: string) => getProjectStorage().getSettings(id),
		saveSettings: (
			id: string,
			patch: Parameters<
				ReturnType<typeof getProjectStorage>["saveSettings"]
			>[1],
		) => getProjectStorage().saveSettings(id, patch),
		exportArchive: (
			projectId: string,
			options?: Parameters<
				ReturnType<typeof getSessionStorage>["exportProjectArchive"]
			>[1],
		) => getSessionStorage().exportProjectArchive(projectId, options),
		listOrphans: () => getProjectStorage().listOrphans(),
		restoreOrphan: (id: string) => getProjectStorage().restoreOrphan(id),
		deleteOrphan: (id: string) => getProjectStorage().deleteOrphan(id),
		relinkOrphan: (id: string, newCwd: string) =>
			getProjectStorage().relinkOrphan(id, newCwd),
	},

	// ─── Sessions（A-6: project-session-redesign）─
	sessions: {
		list: (projectId: string | null) => getSessionStorage().list(projectId),
		listDeleted: (projectId?: string | null) =>
			getSessionStorage().listDeleted(projectId),
		create: (
			input: Parameters<ReturnType<typeof getSessionStorage>["create"]>[0],
		) => getSessionStorage().create(input),
		getMeta: (sessionId: string) => getSessionStorage().getMeta(sessionId),
		updateMeta: (
			sessionId: string,
			patch: Parameters<ReturnType<typeof getSessionStorage>["updateMeta"]>[1],
		) => getSessionStorage().updateMeta(sessionId, patch),
		rename: (sessionId: string, name: string) =>
			getSessionStorage().rename(sessionId, name),
		delete: (sessionId: string) => getSessionStorage().delete(sessionId),
		restoreDeleted: (sessionId: string) =>
			getSessionStorage().restoreDeleted(sessionId),
		archive: (sessionId: string, archived: boolean) =>
			getSessionStorage().archive(sessionId, archived),
		purgeTombstone: (
			sessionId: string,
			opts?: { forceIgnoreRemoteBinding?: boolean },
		) => getSessionStorage().purgeTombstone(sessionId, opts),
		reassignProject: (sessionId: string, nextProjectId: string | null) =>
			getSessionStorage().reassignProject(sessionId, nextProjectId),
		appendEvent: (
			sessionId: string,
			event: Parameters<ReturnType<typeof getSessionStorage>["appendEvent"]>[1],
		) => getSessionStorage().appendEvent(sessionId, event),
		readMessages: (
			sessionId: string,
			range?: Parameters<
				ReturnType<typeof getSessionStorage>["readMessages"]
			>[1],
		) => getSessionStorage().readMessages(sessionId, range),
		readMessagesPage: (
			sessionId: string,
			options?: Parameters<
				ReturnType<typeof getSessionStorage>["readMessagesPage"]
			>[1],
		) => getSessionStorage().readMessagesPage(sessionId, options),
		readContentRef: (
			sessionId: string,
			contentRef: string,
			options?: Parameters<
				ReturnType<typeof getSessionStorage>["readContentRef"]
			>[2],
		) =>
			toSessionContentRefReadResult(
				getSessionStorage().readContentRef(sessionId, contentRef, options),
			),
		exportArchive: (
			sessionId: string,
			options?: Parameters<
				ReturnType<typeof getSessionStorage>["exportSessionArchive"]
			>[1],
		) => getSessionStorage().exportSessionArchive(sessionId, options),
		fork: (
			sourceId: string,
			opts: Parameters<ReturnType<typeof getSessionStorage>["fork"]>[1],
		) => getSessionStorage().fork(sourceId, opts),
	},

	// ─── cwd resolution ──────────────────────────────
	// G-2: 会话 cwd 改成 per-session 沙箱（userData/chats/<user>/(<project>/)session/<sid>）。
	// 项目根目录改由 `resolveProjectRoot` 暴露，给前端组装系统提示词时引用。
	cwd: {
		resolveSessionCwd: (sessionId: string) => resolveConversationCwd(sessionId),
		resolveProjectRoot: (sessionId: string) =>
			resolveConversationProjectRoot(sessionId),
	},

	// ─── workspace file enumeration ─────────────────
	// 给 composer 的 "@" 文件提及面板用。一次性枚举项目根 + 会话沙箱下的文件，
	// 渲染端做内存过滤；这里只负责"列出有什么"，不做 fuzzy。
	workspace: {
		listFiles: async (req: {
			sessionId: string;
			limit?: number;
		}): Promise<{
			files: Array<{
				absolutePath: string;
				relativePath: string;
				root: "project" | "session";
				name: string;
				dir: string;
				ext: string;
				size: number;
				mtimeMs: number;
			}>;
			roots: { projectRoot?: string; sessionCwd?: string };
		}> => {
			const limit = Math.max(1, Math.min(req.limit ?? 5000, 20000));

			const projectRoot =
				resolveConversationProjectRoot(req.sessionId) || undefined;
			const sessionCwd = resolveConversationCwd(req.sessionId) || undefined;

			// 同名文件 dedupe：project 优先于 session（用户更关心源代码）
			const seen = new Set<string>();
			const out: Array<{
				absolutePath: string;
				relativePath: string;
				root: "project" | "session";
				name: string;
				dir: string;
				ext: string;
				size: number;
				mtimeMs: number;
			}> = [];

			const ignore = [
				"**/node_modules/**",
				"**/.git/**",
				"**/.svn/**",
				"**/.hg/**",
				"**/dist/**",
				"**/build/**",
				"**/out/**",
				"**/.next/**",
				"**/.turbo/**",
				"**/.cache/**",
				"**/.parcel-cache/**",
				"**/coverage/**",
				"**/.nyc_output/**",
				"**/*.lock",
				"**/*.map",
				"**/.DS_Store",
			];

			async function enumerate(
				cwd: string | undefined,
				rootKind: "project" | "session",
			): Promise<void> {
				if (!cwd) return;
				if (!existsSync(cwd)) return;
				try {
					const absPaths = await glob(["**/*"], {
						cwd,
						onlyFiles: true,
						dot: false,
						absolute: true,
						expandDirectories: false,
						ignore,
					});
					for (const abs of absPaths) {
						if (out.length >= limit) return;
						if (seen.has(abs)) continue;
						seen.add(abs);
						let size = 0;
						let mtimeMs = 0;
						try {
							const stats = statSync(abs);
							size = stats.size;
							mtimeMs = stats.mtimeMs;
						} catch {
							/* unreadable — skip */
							continue;
						}
						const rel = relative(cwd, abs).split(sep).join("/");
						out.push({
							absolutePath: abs,
							relativePath: rel,
							root: rootKind,
							name: basename(abs),
							dir: dirname(rel) === "." ? "" : dirname(rel),
							ext: extname(abs).toLowerCase(),
							size,
							mtimeMs,
						});
					}
				} catch {
					// per-root soft-fail — keep going with whatever we got
				}
			}

			await enumerate(projectRoot, "project");
			if (out.length < limit) {
				await enumerate(sessionCwd, "session");
			}

			// mtime 倒序，新文件优先（query 为空时直接展示最近修改的）
			out.sort((a, b) => b.mtimeMs - a.mtimeMs);

			return {
				files: out,
				roots: { projectRoot, sessionCwd },
			};
		},
	},

	// ─── G-3 老数据导入 ───────────────────────
	legacyData: {
		detect: () => getLegacyImporter().detect(),
		importAll: () => getLegacyImporter().importAll(),
		purge: () => getLegacyImporter().purge(),
	},
	recovery: {
		exportBundle: (
			options?: Parameters<RecoveryBundleService["exportBundle"]>[0],
		) => {
			const sessionStorage = getSessionStorage();
			const diagnosticExport = new DiagnosticExportService({
				appUserDataDir: app.getPath("userData"),
				sessionStorage,
				traceCollector: getAgentTraceCollector(),
				appVersion: app.getVersion(),
			});
			const service = new RecoveryBundleService({
				userRoot: sessionStorage.getUserRoot(),
				sessionStorage,
				diagnosticExport,
				appVersion: () => app.getVersion(),
			});
			return service.exportBundle(options);
		},
	},
};

// ════════════════════════════════════════════
// Registration
// ════════════════════════════════════════════

/**
 * 注册所有通过 Typed IPC Proxy 管理的 handlers
 */
export function registerProxyHandlers(): void {
	// 合并内置 Agent 预设
	mergeBuiltinPresets();

	// 注册所有 RPC handlers
	registerAPI(apiImpl);

	// 加载已持久化的 MCP 服务器
	mcpService.loadPersistedServers();

	// 手动注册：openDevTools 需要 event.sender
	ipcMain.handle("app:open-dev-tools", (event) => {
		try {
			BrowserWindow.fromWebContents(event.sender)?.webContents.openDevTools({
				mode: "detach",
			});
			return { success: true, data: undefined };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { success: false, error: message };
		}
	});
}

// ════════════════════════════════════════════
// Plugin lifecycle (used by main.ts)
// ════════════════════════════════════════════

/**
 * 初始化插件管理器
 */
export async function initializePluginManager(): Promise<void> {
	const pluginManager = getPluginManager();
	await pluginManager.initialize();

	// Wire up chat hook registry to LLM service
	try {
		const { llmService: llm } = await import("../services/llm");
		llm.setChatHookRegistry(pluginManager.chatHookRegistry);
	} catch (error) {
		log.warn("Failed to wire chat hooks to LLM service", error);
	}

	// Register reload listeners on all existing windows so CSS re-injects on HMR/reload
	for (const win of BrowserWindow.getAllWindows()) {
		pluginManager.setupWindowReloadListener(win);
	}

	// Also register on any future windows
	app.on("browser-window-created", (_event, win) => {
		pluginManager.setupWindowReloadListener(win);
	});
}

/**
 * 清理插件处理器
 */
export function disposePluginHandlers(): void {
	const pluginManager = getPluginManager();
	pluginManager.dispose();
	resetPluginManager();
}
