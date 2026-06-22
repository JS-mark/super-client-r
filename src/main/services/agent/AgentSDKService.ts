/**
 * Agent SDK Service
 *
 * 封装 @anthropic-ai/claude-agent-sdk 的 query() API，提供：
 * - 完整 agent loop（工具调用 → 响应 → 工具调用循环）
 * - 自动最优配置（model/effort/thinking）
 * - Session 持久化与恢复
 * - 流式事件转发
 * - 权限控制
 */

import {
	type Query,
	type SDKMessage,
	type Options,
	type PermissionResult,
	type PermissionUpdate,
	type McpServerConfig as ClaudeMcpServerConfig,
	listSessions,
	getSessionInfo,
	forkSession,
	renameSession,
	tagSession,
	getSessionMessages,
	query,
} from "@anthropic-ai/claude-agent-sdk";
import { EventEmitter } from "events";
import type {
	AgentSDKQueryRequest,
	AgentSDKSessionInfo,
	AgentSDKSessionMessage,
	AgentSDKStreamEvent,
	McpServerConfig as AppMcpServerConfig,
	ModelProvider,
} from "../../ipc/types";
import { storeManager } from "../../store/StoreManager";
import { mcpService } from "../mcp/McpService";
import { getApprovalGrantStore } from "../runtime/ApprovalGrantStore";
import { resolveConversationCwd } from "../runtime/conversationCwd";
import { getRuntimePolicyService } from "../runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../runtime/SessionRuntimeResolver";
import {
	isAgentToolCompatibleModel,
	resolveOptimalConfig,
} from "./AgentAutoConfig";
import type {
	EffectiveSessionRuntime,
	PlanMode,
	ApprovalMode,
} from "@super-client/shared-types/chat";
import { logger } from "../../utils/logger";

const agentSdkLog = logger.withContext("AgentSDK");

/** 活跃查询的上下文 */
interface ActiveQuery {
	requestId: string;
	query: Query;
	sessionId?: string;
	abortController: AbortController;
}

/**
 * §29 — Map our app-level runtime fields onto the Agent SDK's `PermissionMode`.
 *
 *   planMode = "plan-only"          → "plan"               (SDK plans, no acts)
 *   approvalMode = "full-access"    → "bypassPermissions"  (skip canUseTool)
 *   approvalMode = anything else    → "default"            (canUseTool runs)
 *
 * Returns `undefined` when neither input is set so the caller can decide
 * whether to use its own fallback (request / user-settings / hardcoded "default").
 */
/**
 * Claude Agent SDK 强制 sessionId / resume id 必须是 UUID（sdk.mjs 抛
 * "Invalid session ID. Must be a valid UUID."）。我们旧的 conversation id
 * 是 `s_xxx_xxx` 形态，需要在透传前做格式闸门，否则子进程立刻 exit code 1。
 */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function scoreAgentModel(modelId: string): number {
	const id = modelId.toLowerCase();
	if (id.includes("sonnet-4") || id.includes("4-sonnet")) return 100;
	if (id.includes("sonnet-3.7") || id.includes("3.7-sonnet")) return 90;
	if (id.includes("sonnet-3.5") || id.includes("3.5-sonnet")) return 80;
	if (id.includes("sonnet")) return 70;
	if (id.includes("opus")) return 60;
	if (id.includes("claude-3")) return 50;
	if (id.includes("haiku")) return 20;
	return 10;
}

function pickBestAgentModel(
	models: Array<{ id: string; enabled?: boolean }>,
): string | undefined {
	return models
		.filter(
			(model) =>
				model.enabled !== false && isAgentToolCompatibleModel(model.id),
		)
		.sort((a, b) => scoreAgentModel(b.id) - scoreAgentModel(a.id))[0]?.id;
}

/**
 * 把每条 SDK message 的判别要点摘成单行——用于 `[sdk-message]` 诊断 tag。
 * 仅记 type / subtype / content-block 关键字段，避免泄露 prompt 全文。
 */
function buildSdkMessageDebugTag(message: SDKMessage): string {
	const msg = message as unknown as Record<string, unknown>;
	const type = String(msg.type ?? "?");
	if (type === "stream_event") {
		const ev = (msg.event ?? {}) as Record<string, unknown>;
		const evType = String(ev.type ?? "?");
		const contentBlock = (ev.content_block ?? {}) as Record<string, unknown>;
		const blockType =
			typeof contentBlock.type === "string" ? contentBlock.type : "";
		const blockName =
			typeof contentBlock.name === "string" ? contentBlock.name : "";
		const blockId = typeof contentBlock.id === "string" ? contentBlock.id : "";
		const deltaType = String(
			((ev.delta ?? {}) as Record<string, unknown>).type ?? "",
		);
		return `type=stream_event event=${evType}${blockType ? ` block=${blockType}` : ""}${blockName ? ` name=${blockName}` : ""}${blockId ? ` id=${blockId}` : ""}${deltaType ? ` delta=${deltaType}` : ""}`;
	}
	if (type === "assistant") {
		const content = ((msg.message as Record<string, unknown> | undefined)
			?.content ?? []) as Array<{ type?: string }>;
		const kinds = content.map((c) => c?.type ?? "?").join(",");
		return `type=assistant content=[${kinds}]`;
	}
	if (type === "result") {
		return `type=result subtype=${String(msg.subtype ?? "?")}`;
	}
	if (type === "system") {
		return `type=system subtype=${String(msg.subtype ?? "?")}`;
	}
	return `type=${type}`;
}

function derivePermissionModeFromRuntime(
	planMode: PlanMode | undefined,
	approvalMode: ApprovalMode | undefined,
): Options["permissionMode"] | undefined {
	if (planMode === "plan-only") return "plan";
	if (approvalMode === "full-access") return "bypassPermissions";
	if (planMode || approvalMode) return "default";
	return undefined;
}

export class AgentSDKService extends EventEmitter {
	private activeQueries: Map<string, ActiveQuery> = new Map();

	/**
	 * 创建并执行查询
	 */
	async createQuery(
		requestId: string,
		request: AgentSDKQueryRequest,
	): Promise<void> {
		agentSdkLog.info("createQuery start", {
			requestId,
			sessionId: request.sessionId,
			resumeSessionId: request.resumeSessionId,
			cwd: request.cwd,
			model: request.model,
			providerId: request.providerId,
			mcpServerCount: request.mcpServerNames?.length ?? 0,
			hasSystemPrompt: Boolean(request.systemPrompt?.trim()),
			promptLength: request.prompt.length,
		});
		// §29 — Resolve runtime once and use it both for audit AND for option
		// defaults (planMode → permissionMode, approvalMode → permissionMode,
		// sessionId → cwd fallback). Caller-supplied request fields still take
		// precedence; runtime only fills gaps.
		const sessionId = request.sessionId;
		let runtime: EffectiveSessionRuntime | null = null;
		if (sessionId) {
			try {
				runtime = getSessionRuntimeResolver().resolve({ sessionId });
				getRuntimePolicyService().record(
					{
						workspaceId: runtime.workspaceId,
						sessionId,
						source: "agent-sdk",
						operation: "agent-sdk:create-query",
						kind: "tool-execute",
						input: {
							model: runtime.model,
							interactionProfile: runtime.interactionProfile,
							planMode: runtime.planMode,
							approvalMode: runtime.runtimePolicy.approvalMode,
							sandboxMode: runtime.runtimePolicy.sandboxMode,
						},
					},
					"audit-only",
				);
			} catch (err) {
				// Resolver failure is non-fatal: Agent SDK can run without alignment.
				console.warn(
					"[AgentSDKService] resolveSessionRuntime failed; continuing without alignment",
					err,
				);
			}
		}

		// 读取用户 Settings 页面配置
		const userConfig = storeManager.getAgentSDKConfig();
		// 获取 provider 级别的 agent 模型配置
		const providerModel = this.getProviderAgentModel(request.providerId);
		// 自动推断最优配置（合并用户配置 + provider 模型）
		const config = resolveOptimalConfig(request, userConfig, providerModel);
		const abortController = new AbortController();

		// §29 — cwd resolution priority:
		//   request.cwd  →  WorkspaceConfig.path (via resolveConversationCwd)
		//                →  per-conversation sandbox dir
		//                →  process.cwd()
		let cwd = request.cwd;
		if (!cwd && sessionId) {
			try {
				cwd = resolveConversationCwd(sessionId);
			} catch (err) {
				console.warn(
					"[AgentSDKService] resolveConversationCwd failed; falling back to process.cwd():",
					err,
				);
			}
		}
		if (!cwd) cwd = process.cwd();

		// §29 — derive a runtime-aware default permissionMode when neither the
		// caller nor the user settings supplied one. Plan-only mode maps to the
		// SDK's `plan` permission (model plans without acting); full-access maps
		// to `bypassPermissions`; everything else stays `default` (canUseTool runs).
		const explicitPermissionMode =
			request.permissionMode || userConfig.defaultPermissionMode;
		const runtimeDefaultPermissionMode = derivePermissionModeFromRuntime(
			runtime?.planMode,
			runtime?.runtimePolicy.approvalMode,
		);
		const effectivePermissionMode =
			explicitPermissionMode || runtimeDefaultPermissionMode || "default";

		// 从用户配置的 Anthropic provider 中解析认证环境变量
		// providerId 优先 —— 让 baseUrl/apiKey 跟随用户在会话里选定的 provider
		const anthropicEnv = this.resolveAnthropicEnv(
			config.model,
			request.providerId,
		);
		if (!anthropicEnv) {
			const error = this.getAgentSdkAuthError(config.model);
			agentSdkLog.error("createQuery missing Anthropic auth", undefined, {
				requestId,
				model: config.model,
				providerId: request.providerId,
				error,
			});
			this.emit("stream-event", {
				requestId,
				type: "error",
				error,
			} satisfies AgentSDKStreamEvent);
			return;
		}

		console.log(
			`[AgentSDK] Resolved model: "${config.model}" (request=${request.model}, userConfig=${userConfig.defaultModel}, provider=${providerModel}, fallback=claude-sonnet-4-5)`,
		);
		agentSdkLog.info("model/auth resolved", {
			requestId,
			model: config.model,
			requestModel: request.model,
			requestModelAgentCompatible: isAgentToolCompatibleModel(request.model),
			userDefaultModel: userConfig.defaultModel,
			providerModel,
			hasBaseUrl: Boolean(anthropicEnv.ANTHROPIC_BASE_URL),
			authMode: anthropicEnv.ANTHROPIC_AUTH_TOKEN
				? "third-party"
				: "native-anthropic",
		});

		// 构建 query options
		const options: Options = {
			abortController,
			model: config.model,
			effort: config.effort,
			thinking: config.thinking,
			maxTurns: config.maxTurns,
			maxBudgetUsd: config.maxBudgetUsd,
			persistSession: config.persistSession,
			includePartialMessages: config.includePartialMessages,
			permissionMode: effectivePermissionMode,
			cwd,
			// 禁止子进程加载用户的 ~/.claude/settings.json，避免其中的 env/model 覆盖我们的注入
			settingSources: [],
			// 注入 Anthropic 认证环境变量到 SDK 子进程
			env: {
				...process.env,
				...anthropicEnv,
				ELECTRON_RUN_AS_NODE: "1",
				ELECTRON_NO_ATTACH_CONSOLE: "1",
			},
			/**
			 * 捕获子进程 stderr。SDK 默认会 `ignore` 子进程 stderr（sdk.mjs:19），
			 * 导致 "Claude Code process exited with code 1" 没有任何 root cause
			 * 信息。这里把每一行 stderr 打到主进程 console 并 emit `stderr-line`，
			 * 让 trace sniffer 抓进 `native.log` 记录。
			 */
			stderr: (chunk: string) => {
				const text = String(chunk);
				for (const line of text.split(/\r?\n/)) {
					const trimmed = line.trim();
					if (!trimmed) continue;
					console.warn(`[claude-sdk stderr ${requestId}] ${trimmed}`);
					this.emit("stderr-line", { requestId, line: trimmed });
				}
			},
		};

		// 恢复已有 session（SDK 要求 UUID）
		if (request.resumeSessionId && UUID_RE.test(request.resumeSessionId)) {
			options.resume = request.resumeSessionId;
		}

		// 自定义 session ID：SDK 强校验 UUID（sdk.mjs 触发 "Invalid session ID. Must
		// be a valid UUID."）。我们的 conversation id 是 `s_xxx_xxx` 形态，不是 UUID
		// —— 不能直接透传，否则子进程立刻 exit code 1。
		//
		// 行为：UUID 形态才透传；否则不传，让 SDK 自动生成；之后 init 事件会回
		// 写到 SessionMeta.nativeSessionId / agentSDKSessionId，用于下一次 resume。
		if (
			request.sessionId &&
			!request.resumeSessionId &&
			UUID_RE.test(request.sessionId)
		) {
			options.sessionId = request.sessionId;
		}

		// 子代理定义
		if (request.agents) {
			options.agents = request.agents;
		}

		if (request.systemPrompt?.trim()) {
			options.systemPrompt = {
				type: "preset",
				preset: "claude_code",
				append: request.systemPrompt.trim(),
			};
		}

		const mcpServers = this.buildAgentMcpServers(request.mcpServerNames);
		if (mcpServers && Object.keys(mcpServers).length > 0) {
			options.mcpServers = mcpServers;
			options.strictMcpConfig = true;
			console.info(
				`[AgentSDK] Injected MCP servers: ${Object.keys(mcpServers).join(", ")}`,
			);
			agentSdkLog.info("mcp servers injected", {
				requestId,
				mcpServerNames: Object.keys(mcpServers),
			});
		}

		this.emit("stream-event", {
			requestId,
			type: "status",
			status: "Agent starting...",
		} satisfies AgentSDKStreamEvent);

		// 权限回调
		// 注：迁移期 sessionId === conversationId（见 shared-types/chat.ts），
		// 用于查询/记录 ApprovalGrantStore 的会话级授权。
		const conversationId = request.sessionId;
		options.canUseTool = async (toolName, input, callbackOptions) => {
			return this.handlePermissionRequest(
				requestId,
				toolName,
				input,
				callbackOptions,
				conversationId,
			);
		};

		// 创建 query
		agentSdkLog.info("query spawn", {
			requestId,
			cwd,
			permissionMode: options.permissionMode,
			hasMcpServers: Boolean(options.mcpServers),
			hasResume: Boolean(options.resume),
			hasSessionId: Boolean(options.sessionId),
		});
		const q = query({
			prompt: request.prompt,
			options,
		});

		const activeQuery: ActiveQuery = {
			requestId,
			query: q,
			abortController,
		};
		this.activeQueries.set(requestId, activeQuery);

		try {
			// 消费流式消息
			for await (const message of q) {
				// 诊断：把 SDK 原始 message.type + 关键判别字段写入 stderr-line，
				// 让 sniffer 落入 trace 的 native.log。便于排查"为什么没有 chunk"。
				const debugTag = buildSdkMessageDebugTag(message);
				if (debugTag) {
					if (!debugTag.includes("content_block_delta")) {
						agentSdkLog.info("sdk message", { requestId, debugTag });
					}
					this.emit("stderr-line", {
						requestId,
						line: `[sdk-message] ${debugTag}`,
					});
				}

				const converted = this.convertSDKMessage(requestId, message);
				const events = Array.isArray(converted)
					? converted
					: converted
						? [converted]
						: [];
				for (const event of events) {
					// 捕获 session ID
					if ("session_id" in message && message.session_id) {
						activeQuery.sessionId = message.session_id;
					}
					this.emit("stream-event", event);
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			agentSdkLog.error(
				"createQuery failed",
				error instanceof Error ? error : undefined,
				{ requestId, error: errorMessage, sessionId: activeQuery.sessionId },
			);
			this.emit("stream-event", {
				requestId,
				type: "error",
				error: errorMessage,
				sessionId: activeQuery.sessionId,
			} satisfies AgentSDKStreamEvent);
		} finally {
			agentSdkLog.info("createQuery cleanup", { requestId });
			this.activeQueries.delete(requestId);
		}
	}

	/**
	 * 中断查询
	 *
	 * 行为：先发"软中断"`q.interrupt()`（等 SDK 自己吐 cancelled result）；
	 * 1.5s 内若 query 仍在 activeQueries（说明软中断没让 `for await` 退出，
	 * 例如 canUseTool 卡在等用户、SDK 子进程半死、第三方网关静默不收尾），
	 * 自动升级为硬关闭 `q.close() + abortController.abort()`：
	 *   - `consumeQuery` 的 `for await` 抛 AbortError → catch 块 emit error event
	 *   - canUseTool 的 abort 监听自动 deny pending 权限
	 *   - `activeQueries` 由 consumeQuery 的 finally 自然清理（此处不 delete）
	 */
	async interruptQuery(requestId: string): Promise<boolean> {
		const active = this.activeQueries.get(requestId);
		if (!active) return false;

		let interruptOk = true;
		try {
			await active.query.interrupt();
		} catch {
			interruptOk = false;
		}

		// 兜底：到点仍未收尾就硬关闭，解放 renderer
		setTimeout(() => {
			const stale = this.activeQueries.get(requestId);
			if (!stale) return;
			agentSdkLog.warn("interrupt soft-timeout, hard-closing", {
				requestId,
				interruptOk,
			});
			try {
				stale.query.close();
			} catch (err) {
				agentSdkLog.warn("hard-close query failed", {
					requestId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
			try {
				stale.abortController.abort();
			} catch (err) {
				agentSdkLog.warn("hard-abort controller failed", {
					requestId,
					error: err instanceof Error ? err.message : String(err),
				});
			}
		}, 1500);

		return interruptOk;
	}

	/**
	 * 关闭查询
	 */
	closeQuery(requestId: string): boolean {
		const active = this.activeQueries.get(requestId);
		if (!active) return false;

		active.query.close();
		active.abortController.abort();
		this.activeQueries.delete(requestId);
		return true;
	}

	/**
	 * 切换模型
	 */
	async setModel(requestId: string, model: string): Promise<boolean> {
		const active = this.activeQueries.get(requestId);
		if (!active) return false;

		try {
			await active.query.setModel(model);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 列出所有 Agent SDK sessions
	 */
	async listSDKSessions(dir?: string): Promise<AgentSDKSessionInfo[]> {
		try {
			const sessions = await listSessions({ dir });
			return sessions.map((s) => ({
				sessionId: s.sessionId,
				summary: s.summary,
				lastModified: s.lastModified,
				createdAt: s.createdAt,
				cwd: s.cwd,
				tag: s.tag,
				customTitle: s.customTitle,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * 获取 session 详情
	 */
	async getSDKSessionInfo(
		sessionId: string,
	): Promise<AgentSDKSessionInfo | null> {
		try {
			const info = await getSessionInfo(sessionId);
			if (!info) return null;
			return {
				sessionId: info.sessionId,
				summary: info.summary,
				lastModified: info.lastModified,
				createdAt: info.createdAt,
				cwd: info.cwd,
				tag: info.tag,
				customTitle: info.customTitle,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Fork 一个已有 session
	 */
	async forkSDKSession(
		sessionId: string,
		options?: { dir?: string },
	): Promise<{ sessionId: string } | null> {
		try {
			const result = await forkSession(sessionId, options);
			return result ? { sessionId: result.sessionId } : null;
		} catch {
			return null;
		}
	}

	/**
	 * 重命名 session
	 */
	async renameSDKSession(
		sessionId: string,
		title: string,
		options?: { dir?: string },
	): Promise<boolean> {
		try {
			await renameSession(sessionId, title, options);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 给 session 打标签
	 */
	async tagSDKSession(
		sessionId: string,
		tag: string,
		options?: { dir?: string },
	): Promise<boolean> {
		try {
			await tagSession(sessionId, tag, options);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 获取 session 消息列表
	 */
	async getSDKSessionMessages(
		sessionId: string,
		options?: { dir?: string },
	): Promise<AgentSDKSessionMessage[]> {
		try {
			const messages = await getSessionMessages(sessionId, options);
			return messages.map((m) => ({
				type: m.type as "user" | "assistant",
				uuid: m.uuid,
				sessionId: m.session_id,
				message: m.message,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * 检查是否有活跃查询
	 */
	hasActiveQuery(requestId: string): boolean {
		return this.activeQueries.has(requestId);
	}

	/**
	 * 获取活跃查询数量
	 */
	getActiveQueryCount(): number {
		return this.activeQueries.size;
	}

	// ─── Private ──────────────────────────────────────────────────────────

	private buildAgentMcpServers(
		serverNames?: string[],
	): Record<string, ClaudeMcpServerConfig> | undefined {
		const hasExplicitSelection = Boolean(serverNames?.length);
		const requested = new Set(serverNames ?? []);
		const result: Record<string, ClaudeMcpServerConfig> = {};
		const servers = mcpService
			.listServers()
			.filter((server) => {
				if (server.enabled === false) return false;
				if (!hasExplicitSelection) return true;
				return requested.has(server.id) || requested.has(server.name);
			});

		const skipped: Array<{
			id: string;
			name: string;
			transport?: string;
			reason: string;
		}> = [];

		for (const server of servers) {
			const config = this.toAgentMcpServerConfig(server);
			if (!config) {
				skipped.push({
					id: server.id,
					name: server.name,
					transport: server.transport,
					reason:
						server.transport === "internal"
							? "internal MCP is in-process and not yet exposed as an Agent SDK MCP transport"
							: "unsupported or incomplete MCP transport config",
				});
				continue;
			}

			const baseName = this.normalizeMcpServerName(server.id || server.name);
			let name = baseName;
			let suffix = 2;
			while (result[name]) {
				name = `${baseName}-${suffix}`;
				suffix += 1;
			}
			result[name] = config;
		}

		agentSdkLog.info("mcp server resolution", {
			requestedMcpServerNames: serverNames,
			mode: hasExplicitSelection ? "explicit" : "auto-all-enabled",
			candidateCount: servers.length,
			injectedCount: Object.keys(result).length,
			skipped,
		});

		return Object.keys(result).length > 0 ? result : undefined;
	}

	private toAgentMcpServerConfig(
		server: AppMcpServerConfig,
	): ClaudeMcpServerConfig | null {
		if (server.transport === "stdio") {
			if (!server.command) return null;
			return {
				type: "stdio",
				command: server.command,
				...(server.args?.length ? { args: server.args } : {}),
				...(server.env ? { env: server.env } : {}),
			};
		}

		if (server.transport === "sse") {
			if (!server.url) return null;
			return {
				type: "sse",
				url: server.url,
				...(server.headers ? { headers: server.headers } : {}),
			};
		}

		if (server.transport === "http") {
			if (!server.url) return null;
			return {
				type: "http",
				url: server.url,
				...(server.headers ? { headers: server.headers } : {}),
			};
		}

		return null;
	}

	private normalizeMcpServerName(name: string): string {
		const normalized = name
			.replace(/^@/, "")
			.replace(/[^a-zA-Z0-9_.-]/g, "-")
			.replace(/^-+|-+$/g, "");
		return normalized || "mcp-server";
	}

	/**
	 * 获取 claudeCodeEnabled provider 上配置的 agent 模型
	 */
	private getProviderAgentModel(preferredProviderId?: string): string | undefined {
		try {
			const providers = storeManager.getModelProviders();
			if (preferredProviderId) {
				const preferred = providers.find(
					(p) => p.id === preferredProviderId && p.enabled,
				);
				if (preferred?.claudeCodeEnabled) {
					const compatibleModel =
						this.getCompatibleProviderAgentModel(preferred);
					if (compatibleModel) return compatibleModel;
				}
			}
			const ccProvider = providers.find(
				(p) =>
					p.claudeCodeEnabled &&
					p.enabled &&
					Boolean(this.getCompatibleProviderAgentModel(p)),
			);
			if (ccProvider) return this.getCompatibleProviderAgentModel(ccProvider);

			const anthropicProvider = providers.find(
				(p) => p.preset === "anthropic" && p.enabled,
			);
			if (anthropicProvider) {
				return (
					this.getCompatibleProviderAgentModel(anthropicProvider) ||
					"claude-sonnet-4-5"
				);
			}
			return undefined;
		} catch {
			return undefined;
		}
	}

	private getCompatibleProviderAgentModel(
		provider: ModelProvider,
	): string | undefined {
		if (provider.claudeCodeModel) {
			if (isAgentToolCompatibleModel(provider.claudeCodeModel)) {
				return provider.claudeCodeModel;
			}
			agentSdkLog.warn("ignored incompatible Claude Code provider model", {
				providerId: provider.id,
				providerName: provider.name,
				model: provider.claudeCodeModel,
			});
		}
		return pickBestAgentModel(provider.models ?? []);
	}

	private getAgentSdkAuthError(modelId?: string): string {
		try {
			const providers = storeManager.getModelProviders();
			const invalidClaudeCodeProviders = providers.filter(
				(provider) =>
					provider.enabled &&
					provider.claudeCodeEnabled &&
					!this.getCompatibleProviderAgentModel(provider),
			);
			if (invalidClaudeCodeProviders.length > 0) {
				const provider = invalidClaudeCodeProviders[0];
				const configuredModel =
					provider.claudeCodeModel || provider.models?.[0]?.id || "(not set)";
				return `Agent SDK 需要 Claude Code 兼容模型。当前 Claude Code Provider「${provider.name}」配置的是「${configuredModel}」，Claude Code SDK 不支持这个模型，因此不会执行 agent/tool_use。请把该 Provider 的 Claude Code 模型改为 Claude/Sonnet/Opus/Haiku 系列，或配置可用的 Anthropic/OpenRouter Claude Code Provider。`;
			}
		} catch {
			// Fall through to generic auth message.
		}

		return `Agent SDK 未找到可用认证。当前解析模型为「${modelId || "claude-sonnet-4-5"}」。请在 设置 → 模型 中配置可用的 Anthropic Provider，或启用一个使用 Claude/Sonnet/Opus/Haiku 模型的 Claude Code Provider。`;
	}

	/**
	 * 从用户配置的 model provider 中解析 Agent SDK 子进程环境变量
	 *
	 * 认证模式：
	 * - 原生 Anthropic (preset=anthropic): ANTHROPIC_API_KEY
	 * - 第三方服务商 (OpenRouter 等):     ANTHROPIC_AUTH_TOKEN + ANTHROPIC_API_KEY=""
	 *   参考: https://openrouter.ai/docs/guides/community/anthropic-agent-sdk
	 */
	private resolveAnthropicEnv(
		modelId?: string,
		preferredProviderId?: string,
	): Record<string, string> | null {
		const userConfig = storeManager.getAgentSDKConfig();

		// 优先级（高 → 低）：
		//   1. Agent Settings 的 apiKey/baseUrl override
		//   2. 显式标记 claudeCodeEnabled 的 provider
		//   3. 会话/项目选中的 provider，但仅当它也显式 claudeCodeEnabled
		//   4. preset=anthropic provider
		//   5. 环境变量 ANTHROPIC_API_KEY
		//
		// 关键点：Agent 执行不能被普通聊天模型 provider 抢走。用户当前 UI 选
		// OpenRouter/ai21 只代表聊天模型，不代表 Agent SDK 的认证和模型能力。
		let apiKey: string | undefined;
		let baseUrl: string | undefined;
		let isNativeAnthropic = true;
		let resolvedFrom = "(none)";

		// 1. Agent Settings override
		if (userConfig.apiKeyOverride) {
			apiKey = userConfig.apiKeyOverride;
			baseUrl = userConfig.baseUrlOverride;
			if (baseUrl && !this.isAnthropicUrl(baseUrl)) {
				isNativeAnthropic = false;
			}
			resolvedFrom = "agent-settings-override";
		}

		// 2-4. provider 兜底（claudeCodeEnabled → selected claudeCodeEnabled → preset=anthropic）
		if (!apiKey) {
			try {
				const providers = storeManager.getModelProviders();
				const selectedAgentProvider = preferredProviderId
					? providers.find(
							(p) =>
								p.id === preferredProviderId &&
								p.claudeCodeEnabled &&
								p.enabled &&
								p.apiKey &&
								Boolean(this.getCompatibleProviderAgentModel(p)),
						)
					: undefined;
				const ccProvider = providers.find(
					(p) =>
						p.claudeCodeEnabled &&
						p.enabled &&
						p.apiKey &&
						Boolean(this.getCompatibleProviderAgentModel(p)),
				);
				const targetProvider =
					selectedAgentProvider ||
					ccProvider ||
					providers.find(
						(p) => p.preset === "anthropic" && p.enabled && p.apiKey,
					);
				if (targetProvider?.apiKey) {
					apiKey = targetProvider.apiKey;
					baseUrl = baseUrl || targetProvider.baseUrl;
					isNativeAnthropic = targetProvider.preset === "anthropic";
					resolvedFrom = `provider-fallback:${targetProvider.name}(${targetProvider.id})`;
				}
			} catch {
				// non-fatal
			}
		}

		// 5. 回退到环境变量（直接 Anthropic）
		if (!apiKey && process.env.ANTHROPIC_API_KEY) {
			apiKey = process.env.ANTHROPIC_API_KEY;
			isNativeAnthropic = true;
			resolvedFrom = "env-ANTHROPIC_API_KEY";
		}

		if (!apiKey) return null;

		const env: Record<string, string> = {};

		if (isNativeAnthropic) {
			// 原生 Anthropic: 标准 API Key
			env.ANTHROPIC_API_KEY = apiKey;
		} else {
			// 第三方服务商 (OpenRouter 等): Auth Token 模式
			// ANTHROPIC_AUTH_TOKEN 传递第三方 API Key
			// ANTHROPIC_API_KEY 必须显式为空，否则 SDK 会尝试直连 Anthropic
			env.ANTHROPIC_AUTH_TOKEN = apiKey;
			env.ANTHROPIC_API_KEY = "";
		}

		if (baseUrl) {
			// 第三方服务商的 baseUrl 通常带 /v1 后缀（OpenAI 兼容格式），
			// 但 Anthropic SDK 会自行拼接 /v1/messages，需要去掉以避免 /v1/v1/messages 重复
			// 例: https://openrouter.ai/api/v1 → https://openrouter.ai/api
			env.ANTHROPIC_BASE_URL = !isNativeAnthropic
				? baseUrl.replace(/\/v1\/?$/, "")
				: baseUrl;
		}

		console.log(
			`[AgentSDK] Auth mode: ${isNativeAnthropic ? "native-anthropic" : "third-party"}, source=${resolvedFrom}, baseUrl=${env.ANTHROPIC_BASE_URL || "(default)"}`,
		);

		// 模型覆盖
		const resolvedModel = modelId || "claude-sonnet-4-5";
		env.ANTHROPIC_MODEL = resolvedModel;
		env.ANTHROPIC_DEFAULT_SONNET_MODEL = resolvedModel;
		env.ANTHROPIC_DEFAULT_OPUS_MODEL = resolvedModel;
		env.ANTHROPIC_DEFAULT_HAIKU_MODEL = resolvedModel;
		// 注入小/快模型
		if (userConfig.smallFastModel) {
			env.ANTHROPIC_SMALL_FAST_MODEL = userConfig.smallFastModel;
		}
		// 注入自定义环境变量（最高优先级，可覆盖上述所有）
		if (userConfig.customEnvVars) {
			Object.assign(env, userConfig.customEnvVars);
		}
		return env;
	}

	/**
	 * 检查 URL 是否指向 Anthropic 原生 API
	 */
	private isAnthropicUrl(url: string): boolean {
		try {
			const hostname = new URL(url).hostname;
			return (
				hostname === "api.anthropic.com" || hostname.endsWith(".anthropic.com")
			);
		} catch {
			return false;
		}
	}

	/**
	 * 转换 SDK 消息为 IPC 流式事件
	 */
	convertSDKMessage(
		requestId: string,
		message: SDKMessage,
	): AgentSDKStreamEvent | AgentSDKStreamEvent[] | null {
		const sessionId = "session_id" in message ? message.session_id : undefined;

		switch (message.type) {
			case "system": {
				if (message.subtype === "init") {
					return {
						requestId,
						type: "init",
						sessionId,
						status: `Model: ${message.model}, Tools: ${message.tools?.length ?? 0}`,
					};
				}
				if (message.subtype === "status") {
					return {
						requestId,
						type: "status",
						sessionId,
						status: message.status ?? "unknown",
					};
				}
				// SDK 类型联合在某些版本里不含 "permission_denied"；手动收窄。
				if ((message.subtype as string) === "permission_denied") {
					const denied = message as unknown as {
						tool_use_id: string;
						tool_name: string;
						tool_input?: Record<string, unknown>;
						reason?: string;
					};
						return {
							requestId,
							type: "tool_error",
							sessionId,
							toolError: {
								id: denied.tool_use_id,
								name: denied.tool_name,
								input: denied.tool_input || {},
								error: denied.reason || "Permission denied",
								code: "PERMISSION_DENIED",
								kind: "permission",
								title: denied.reason,
							},
							error: denied.reason || "Permission denied",
						} satisfies AgentSDKStreamEvent;
				}
				return null;
			}

			case "assistant": {
				// 完整 assistant 消息 — 提取 text blocks
				const textBlocks = message.message.content
					.filter((b) => b.type === "text")
					.map((b) => ("text" in b ? (b as { text: string }).text : ""))
					.join("");

				const toolEvents = message.message.content
					.filter((b) => b.type === "tool_use")
					.map((block) => {
						const toolBlock = block as unknown as {
							id?: string;
							name?: string;
							input?: Record<string, unknown>;
						};
						const name = toolBlock.name || "tool";
						return {
							requestId,
							type: "tool_call",
							sessionId,
							toolCall: {
								id:
									toolBlock.id ||
									`tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
								name,
								input: toolBlock.input || {},
								kind: name === "AskUserQuestion" ? "ask-user-question" : "tool",
							},
						} satisfies AgentSDKStreamEvent;
					});

				const usage = message.message.usage;
				const assistantEvent = {
					requestId,
					type: "assistant",
					sessionId,
					content: textBlocks,
					usage: usage
						? {
								inputTokens: usage.input_tokens,
								outputTokens: usage.output_tokens,
								cacheCreationInputTokens: (
									usage as unknown as Record<string, number>
								).cache_creation_input_tokens,
								cacheReadInputTokens: (
									usage as unknown as Record<string, number>
								).cache_read_input_tokens,
							}
						: undefined,
				} satisfies AgentSDKStreamEvent;
				if (toolEvents.length === 0) return assistantEvent;
				return textBlocks ? [assistantEvent, ...toolEvents] : toolEvents;
			}

			case "stream_event": {
				// 流式部分消息
				const event = message.event;
				if (
					event.type === "content_block_delta" &&
					"delta" in event &&
					event.delta.type === "text_delta"
				) {
					return {
						requestId,
						type: "chunk",
						sessionId,
						content: (event.delta as { text: string }).text,
					};
				}
				return null;
			}

			case "tool_use_summary": {
				return {
					requestId,
					type: "tool_use_summary",
					sessionId,
					toolSummary: message.summary,
					precedingToolUseIds: message.preceding_tool_use_ids,
				};
			}

			case "result": {
				if (message.subtype === "success") {
					return {
						requestId,
						type: "result",
						sessionId,
						result: {
							success: true,
							text: message.result,
							durationMs: message.duration_ms,
							numTurns: message.num_turns,
							totalCostUsd: message.total_cost_usd,
							stopReason: message.stop_reason,
							usage: {
								inputTokens: message.usage.input_tokens,
								outputTokens: message.usage.output_tokens,
								cacheCreationInputTokens:
									message.usage.cache_creation_input_tokens ?? 0,
								cacheReadInputTokens:
									message.usage.cache_read_input_tokens ?? 0,
							},
						},
					};
				}
				// error result
				return {
					requestId,
					type: "result",
					sessionId,
					result: {
						success: false,
						text: "error" in message ? String(message.error) : "Query failed",
						durationMs:
							"duration_ms" in message ? (message.duration_ms as number) : 0,
						numTurns:
							"num_turns" in message ? (message.num_turns as number) : 0,
						totalCostUsd:
							"total_cost_usd" in message
								? (message.total_cost_usd as number)
								: 0,
						stopReason: null,
						usage: {
							inputTokens: 0,
							outputTokens: 0,
						},
					},
					error: "error" in message ? String(message.error) : "Query failed",
				};
			}

			case "rate_limit_event": {
				return {
					requestId,
					type: "rate_limit",
					sessionId,
					status: `Rate limited: ${message.rate_limit_info.status}`,
				};
			}

			default:
				// 其他消息类型暂不处理
				return null;
		}
	}

	/** 待解决的权限请求 */
	private pendingPermissions: Map<
		string,
		{
			resolve: (result: PermissionResult) => void;
		}
	> = new Map();

	/**
	 * 处理权限请求
	 */
	private handlePermissionRequest(
		requestId: string,
		toolName: string,
		input: Record<string, unknown>,
		options: {
			signal: AbortSignal;
			title?: string;
			description?: string;
			displayName?: string;
			suggestions?: PermissionUpdate[];
			blockedPath?: string;
			decisionReason?: string;
			agentID?: string;
			toolUseID: string;
		},
		conversationId?: string,
	): Promise<PermissionResult> {
		const operationType = `tool:${toolName}`;

		// 在向用户发起请求前先查找已有授权
		if (conversationId) {
			const grant = getApprovalGrantStore().findGrant({
				conversationId,
				operationType,
			});
			if (grant) {
				return Promise.resolve({ behavior: "allow", updatedInput: input });
			}
		}

		return new Promise<PermissionResult>((resolve) => {
			const permissionId = options.toolUseID;

			// 包装 resolver：deny 时记录审计
			const wrappedResolve = (result: PermissionResult) => {
				if (result.behavior === "deny" && conversationId) {
					getApprovalGrantStore().recordDeny(
						conversationId,
						"",
						operationType,
						undefined,
						"user-rejected",
					);
				}
				resolve(result);
			};

			// 存储 resolver
			this.pendingPermissions.set(permissionId, { resolve: wrappedResolve });

			// 发送权限请求到 renderer
			this.emit("stream-event", {
				requestId,
				type: "permission_request",
				permissionRequest: {
					toolName,
					toolUseId: permissionId,
					toolInput: input,
					title: options.title,
					description: options.description,
					displayName: options.displayName,
					suggestions: options.suggestions as
						| NonNullable<
								AgentSDKStreamEvent["permissionRequest"]
						  >["suggestions"]
						| undefined,
					blockedPath: options.blockedPath,
					decisionReason: options.decisionReason,
					agentId: options.agentID,
				},
			} satisfies AgentSDKStreamEvent);

			// 超时自动拒绝（60 秒）
			const timeout = setTimeout(() => {
				if (this.pendingPermissions.has(permissionId)) {
					this.pendingPermissions.delete(permissionId);
					wrappedResolve({
						behavior: "deny",
						message: "Permission request timed out",
					});
				}
			}, 60_000);

			// abort 时清理
			options.signal.addEventListener("abort", () => {
				clearTimeout(timeout);
				if (this.pendingPermissions.has(permissionId)) {
					this.pendingPermissions.delete(permissionId);
					wrappedResolve({ behavior: "deny", message: "Query aborted" });
				}
			});
		});
	}

	/**
	 * 解决权限请求（由 renderer 调用）
	 */
	resolvePermission(
		toolUseId: string,
		allowed: boolean,
		updatedInput?: Record<string, unknown>,
		updatedPermissions?: Array<Record<string, unknown>>,
	): boolean {
		const pending = this.pendingPermissions.get(toolUseId);
		if (!pending) return false;

		if (allowed) {
			pending.resolve({
				behavior: "allow",
				...(updatedInput ? { updatedInput } : {}),
				...(updatedPermissions
					? { updatedPermissions: updatedPermissions as PermissionUpdate[] }
					: {}),
			});
		} else {
			pending.resolve({ behavior: "deny", message: "User denied" });
		}
		this.pendingPermissions.delete(toolUseId);
		return true;
	}
}

// 单例
export const agentSDKService = new AgentSDKService();
