/**
 * useAgentSendPipeline — the "send to agent runtime" pipeline extracted
 * from `useChat.ts` (Phase 0b hook slim-down).
 *
 * Responsibilities:
 *   - Resolve the effective provider/model for the request.
 *   - Snapshot the resolved model onto `currentModelInfoRef` so downstream
 *     error materialisation (`materializeStreamError`) has a rich context.
 *   - Build the prompt context (system prompt, skill context, attachments).
 *   - Load runtime tool bindings (MCP + optional skill tools).
 *   - Invoke `agentRuntimeClient.createQuery`.
 *   - On failure, run `materializeAgentRunCreateFailure` with the correct
 *     `providerErrorCode` (`agent_runtime_create_failed` when a runtime
 *     type was assigned, else `agent_create_query_ipc_failed`).
 *
 * `sendSkillMessage` layers skill/command system-prompt lookup on top of
 * `sendAgentMessage`.
 *
 * The three sub-behaviours below are exposed as pure module-level helpers
 * so vitest can exercise them without wiring a React tree:
 *   - `resolveModelForRequest`
 *   - `loadRuntimeToolsForRequest`
 *   - `runtimeCreateFailureHandler`
 */

import { useCallback, type MutableRefObject } from "react";
import { t } from "i18next";
import { App } from "antd";
import type { LLMErrorContext } from "@super-client/shared-types/chat";
import type {
	AgentToolBinding,
} from "@super-client/shared-types/agent-runtime";
import type { ChatSessionStatus } from "@super-client/shared-types/chat";
import { agentRuntimeClient } from "../services/agent/agentRuntimeClient";
import {
	buildAgentRuntimePromptText,
	buildAgentRuntimeToolBindings,
} from "../services/agent/agentRuntimeStreamAdapter";
import { mcpClient } from "../services/mcp/mcpService";
import { skillClient } from "../services/skill/skillService";
import { createLogger } from "../services/logService";
import type { SearchConfig } from "../types/search";
import { useChatStore } from "../stores/chatStore";
import type { AgentRunRequestType } from "./useAgentRunController";
import { materializeAgentRunCreateFailure } from "./useAgentRunController";
import type {
	BuildPromptContextInput,
	BuildPromptContextOutput,
} from "./usePromptContextBuilder";
import type {
	EffectiveModelSource,
	EffectiveProviderModelResolution,
} from "./useMessageModelResolution";

const agentLog = createLogger("ChatAgent");

export interface CurrentModelInfoSnapshot {
	model: string;
	providerPreset: string;
	providerName: string;
	modelSource?: EffectiveModelSource;
	modelSourceLabel?: string;
	apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
}

export interface AgentSendOptions {
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
	attachmentIds?: string[];
	skillContext?: string;
	skillId?: string;
}

export interface SkillSendOptions {
	searchEngine?: string;
	searchConfigs?: SearchConfig[];
	attachmentIds?: string[];
}

/**
 * Pure model resolution. Wraps a single `resolveActiveProviderModel()` call
 * and produces the paired `modelInfo` snapshot that goes into
 * `currentModelInfoRef.current`.
 */
export async function resolveModelForRequest(
	resolveActiveProviderModel: () => Promise<
		EffectiveProviderModelResolution | undefined
	>,
): Promise<{
	effective: EffectiveProviderModelResolution | undefined;
	modelInfo: CurrentModelInfoSnapshot;
}> {
	const effective = await resolveActiveProviderModel();
	const modelInfo: CurrentModelInfoSnapshot = {
		model: effective?.model.id ?? "agent",
		providerPreset: effective?.provider.preset ?? "anthropic",
		providerName: effective?.provider.name ?? "Agent runtime",
		modelSource: effective?.source,
		modelSourceLabel: effective?.sourceLabel,
	};
	return { effective, modelInfo };
}

export interface LoadRuntimeToolsInput {
	requestId: string;
	activeSkillId?: string;
	connectedMcpServerIds: string[];
	mcpToolsLoader?: () => Promise<
		Array<{ serverId: string; tool: {
			name: string;
			description: string;
			inputSchema: Record<string, unknown>;
		} }>
	>;
	skillToolsLoader?: () => Promise<
		Array<{ skillId: string; tool: {
			name: string;
			description: string;
			inputSchema: Record<string, unknown>;
		} }>
	>;
	log?: {
		warn: (msg: string, meta?: Record<string, unknown>) => void;
	};
}

/**
 * Load MCP tools + (optionally) skill tools in parallel and merge them
 * into runtime tool bindings. Both loaders are wrapped in `.catch(...)`
 * — a missing tool source degrades gracefully to an empty array with a
 * warn log, matching the pre-extraction behaviour.
 */
export async function loadRuntimeToolsForRequest({
	requestId,
	activeSkillId,
	connectedMcpServerIds,
	mcpToolsLoader,
	skillToolsLoader,
	log,
}: LoadRuntimeToolsInput): Promise<AgentToolBinding[]> {
	const loadMcp = mcpToolsLoader ?? (() => mcpClient.getAllTools());
	const loadSkill = skillToolsLoader ?? (() => skillClient.getAllTools());
	const warn = log?.warn ?? ((): void => undefined);

	const [runtimeMcpTools, runtimeSkillTools] = await Promise.all([
		loadMcp().catch((err) => {
			warn("Agent runtime MCP tools unavailable", {
				requestId,
				error: err instanceof Error ? err.message : String(err),
			});
			return [];
		}),
		activeSkillId
			? loadSkill().catch((err) => {
					warn("Agent runtime skill tools unavailable", {
						requestId,
						skillId: activeSkillId,
						error: err instanceof Error ? err.message : String(err),
					});
					return [];
				})
			: Promise.resolve([]),
	]);

	return buildAgentRuntimeToolBindings({
		mcpTools: runtimeMcpTools,
		connectedMcpServerIds,
		skillTools: runtimeSkillTools,
		activeSkillId,
	});
}

export interface RuntimeCreateFailureDeps {
	materializeError: (summary: string, errorContext?: LLMErrorContext) => void;
	setSessionStatus: (status: ChatSessionStatus) => void;
	clearAssistantStream: () => void;
	clearCurrentRequest: () => void;
	clearWatchdog: () => void;
}

/**
 * Materialise an IPC-create failure into an ErrorCard. Classifies the
 * `providerErrorCode` based on whether a runtime request type was already
 * assigned (`setRequestType("runtime")` succeeded but the createQuery call
 * itself threw) versus a pre-runtime IPC failure.
 */
export function runtimeCreateFailureHandler(
	err: unknown,
	options: {
		requestType: AgentRunRequestType | null;
		modelInfo: CurrentModelInfoSnapshot | null;
	},
	deps: RuntimeCreateFailureDeps,
): void {
	const errorMsg = err instanceof Error ? err.message : String(err);
	materializeAgentRunCreateFailure(
		errorMsg,
		{
			preset: options.modelInfo?.providerPreset,
			apiFormat: options.modelInfo?.apiFormat,
			baseUrl: undefined,
			model: options.modelInfo?.model,
			statusCode: undefined,
			endpointUrl: undefined,
			responseBodySnippet: undefined,
			providerErrorCode:
				options.requestType === "runtime"
					? "agent_runtime_create_failed"
					: "agent_create_query_ipc_failed",
			providerErrorMessage: errorMsg,
		},
		deps,
	);
}

export interface UseAgentSendPipelineOptions {
	runController: {
		agentRuntimeSessionIdRef: MutableRefObject<string | null>;
		requestTypeRef: MutableRefObject<AgentRunRequestType | null>;
		setRequestType: (type: AgentRunRequestType | null) => void;
		beginRequest: (requestId: string, type: AgentRunRequestType | null) => void;
		clearCurrentRequest: () => void;
		clearWatchdog: () => void;
		armWatchdog: () => void;
	};
	streamBuffer: {
		clear: () => void;
	};
	messageStoreApi: {
		setSessionStatus: (status: ChatSessionStatus) => void;
	};
	buildPromptContext: (
		input: BuildPromptContextInput,
	) => Promise<BuildPromptContextOutput>;
	resolveActiveProviderModel: () => Promise<
		EffectiveProviderModelResolution | undefined
	>;
	currentModelInfoRef: MutableRefObject<CurrentModelInfoSnapshot | null>;
	materializeStreamError: (
		summary: string,
		errorContext?: LLMErrorContext,
	) => void;
	getSessionSettings: () => { systemPrompt?: string };
	getSelectedSkillId: () => string | null;
	/** Optional injection points used mainly for tests. */
	runtime?: {
		createQuery?: typeof agentRuntimeClient.createQuery;
		getCommandPrompt?: (
			skillId: string,
			commandName: string,
		) => Promise<string | null>;
		getSkillSystemPrompt?: (skillId: string) => Promise<string | null>;
	};
	notify?: {
		error?: (msg: string) => void;
	};
}

export interface UseAgentSendPipelineResult {
	sendAgentMessage: (
		content: string,
		agentId?: string,
		options?: AgentSendOptions,
	) => Promise<void>;
	sendSkillMessage: (
		content: string,
		skillId?: string,
		commandName?: string,
		options?: SkillSendOptions,
	) => Promise<void>;
}

export function useAgentSendPipeline(
	opts: UseAgentSendPipelineOptions,
): UseAgentSendPipelineResult {
	const { message } = App.useApp();

	const sendAgentMessage = useCallback(
		async (
			content: string,
			_agentId?: string,
			options?: AgentSendOptions,
		): Promise<void> => {
			const {
				runController,
				streamBuffer,
				messageStoreApi,
				buildPromptContext,
				resolveActiveProviderModel,
				currentModelInfoRef,
				getSessionSettings,
				getSelectedSkillId,
				runtime,
			} = opts;

			runController.setRequestType(null);
			messageStoreApi.setSessionStatus("preparing");
			streamBuffer.clear();
			runController.armWatchdog();

			const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			runController.beginRequest(requestId, null);

			try {
				const convId = useChatStore.getState().currentConversationId;

				const { effective, modelInfo } = await resolveModelForRequest(
					resolveActiveProviderModel,
				);
				const overrideModelId = effective?.model.id;
				const resolutionSource =
					effective?.source ?? "agent-settings-default";
				console.info(
					`[useChat] agent model resolution: source=${resolutionSource} provider=${effective?.provider.preset ?? "(none)"} model=${effective?.model.id ?? "(runtime default)"}`,
				);
				agentLog.info("Agent model resolved", {
					requestId,
					resolutionSource,
					providerId: effective?.provider.id,
					providerName: effective?.provider.name,
					providerPreset: effective?.provider.preset,
					modelId: effective?.model.id,
					hasProviderApiKey: Boolean(effective?.provider.apiKey),
					hasProviderBaseUrl: Boolean(effective?.provider.baseUrl),
				});
				currentModelInfoRef.current = modelInfo;

				const sessionSettings = getSessionSettings();
				const promptContext = await buildPromptContext({
					requestId,
					conversationId: convId,
					content,
					effective,
					sessionSystemPrompt: sessionSettings.systemPrompt,
					skillContext: options?.skillContext,
					attachmentIds: options?.attachmentIds,
					searchEngine: options?.searchEngine,
					searchConfigs: options?.searchConfigs,
				});
				const { cwd, mcpServerNames, customSystemPrompt } = promptContext;
				agentLog.info("Agent context resolved", {
					requestId,
					conversationId: convId,
					cwd,
					connectedMcpCount: mcpServerNames.length,
					mcpServerNames,
				});
				if (promptContext.warnings.length > 0) {
					agentLog.warn("Agent prompt context warnings", {
						requestId,
						warnings: promptContext.warnings,
					});
				}

				agentLog.info("Agent createQuery IPC start", {
					requestId,
					conversationId: convId,
					model: overrideModelId,
					providerId: effective?.provider.id,
					hasSystemPrompt: Boolean(customSystemPrompt.trim()),
					resumeNativeSessionId:
						runController.agentRuntimeSessionIdRef.current ?? undefined,
					mcpServerCount: mcpServerNames.length,
					attachmentCount: promptContext.attachmentCount,
					searchResultCount: promptContext.searchResultCount,
				});
				if (!convId) {
					throw new Error("No active conversation");
				}

				const activeSkillId =
					options?.skillId ?? getSelectedSkillId() ?? undefined;
				const runtimeTools = await loadRuntimeToolsForRequest({
					requestId,
					activeSkillId,
					connectedMcpServerIds: mcpServerNames,
					log: agentLog,
				});

				runController.setRequestType("runtime");
				const createQuery =
					runtime?.createQuery ?? agentRuntimeClient.createQuery;
				const { runtimeId } = await createQuery({
					requestId,
					conversationId: convId,
					prompt: {
						kind: "text",
						text: buildAgentRuntimePromptText(
							promptContext.prompt,
							customSystemPrompt,
						),
					},
					tools: runtimeTools,
					cwd,
					...(runController.agentRuntimeSessionIdRef.current
						? {
								resume: {
									nativeSessionId:
										runController.agentRuntimeSessionIdRef.current,
								},
							}
						: {}),
				});
				agentLog.info("Agent runtime createQuery accepted", {
					requestId,
					runtimeId,
					toolCount: runtimeTools.length,
				});
			} catch (error: unknown) {
				console.error("[useChat] Failed to send agent message:", error);
				const errorMsg =
					error instanceof Error ? error.message : String(error);
				agentLog.error(
					"Agent createQuery IPC failed",
					error instanceof Error ? error : undefined,
					{ requestId, error: errorMsg },
				);
				runtimeCreateFailureHandler(
					error,
					{
						requestType: opts.runController.requestTypeRef.current,
						modelInfo: opts.currentModelInfoRef.current,
					},
					{
						materializeError: opts.materializeStreamError,
						setSessionStatus: opts.messageStoreApi.setSessionStatus,
						clearAssistantStream: opts.streamBuffer.clear,
						clearCurrentRequest: opts.runController.clearCurrentRequest,
						clearWatchdog: opts.runController.clearWatchdog,
					},
				);
			}
		},
		[opts],
	);

	const sendSkillMessage = useCallback(
		async (
			content: string,
			skillId?: string,
			commandName?: string,
			options?: SkillSendOptions,
		): Promise<void> => {
			if (!skillId) {
				const notifyError = opts.notify?.error ?? message.error;
				notifyError(t("noSkillSelected", { ns: "chat" }));
				return;
			}

			// 获取提示词: command prompt > skill system prompt
			let skillSystemPrompt: string | null = null;
			try {
				const getCommandPrompt =
					opts.runtime?.getCommandPrompt ??
					((sid: string, cname: string) =>
						skillClient.getCommandPrompt(sid, cname));
				const getSkillSystemPrompt =
					opts.runtime?.getSkillSystemPrompt ??
					((sid: string) => skillClient.getSystemPrompt(sid));
				if (commandName) {
					skillSystemPrompt = await getCommandPrompt(skillId, commandName);
				}
				if (!skillSystemPrompt) {
					skillSystemPrompt = await getSkillSystemPrompt(skillId);
				}
			} catch {
				console.warn("[useChat] Failed to load skill/command prompt");
			}
			await sendAgentMessage(content, undefined, {
				skillContext: skillSystemPrompt ?? undefined,
				searchEngine: options?.searchEngine,
				searchConfigs: options?.searchConfigs,
				attachmentIds: options?.attachmentIds,
				skillId,
			});
		},
		[opts, message, sendAgentMessage],
	);

	return { sendAgentMessage, sendSkillMessage };
}
