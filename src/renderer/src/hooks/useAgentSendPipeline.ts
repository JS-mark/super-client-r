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
import type {
	LLMErrorContext,
	MessageContextSource,
	MessageContextStrategy,
} from "@super-client/shared-types/chat";
import type {
	ContextCompactedProductEventInput,
} from "@super-client/shared-types/agent-product-events";
import type {
	AgentHistoryMessage,
	AgentToolBinding,
} from "@super-client/shared-types/agent-runtime";
import type { ChatSessionStatus } from "@super-client/shared-types/chat";
import type { SessionEvent } from "@super-client/shared-types/project";
import type { Message } from "../stores/chatMessageStore";
import { agentRuntimeClient } from "../services/agent/agentRuntimeClient";
import { createContextSummarizer } from "../services/agent/contextSummarizer";
import {
	buildAgentRuntimePromptText,
	buildAgentRuntimeToolBindings,
} from "../services/agent/agentRuntimeStreamAdapter";
import { createContextCompactedSessionEvents } from "../lib/contextEventPersistence";
import { applyContextStrategy } from "../lib/contextManager";
import { estimateTokensSync } from "../lib/tokenizer";
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

export interface PrepareHistoryForRuntimeInput {
	messages: Message[];
	contextCount: number;
	contextMode: "auto" | "compact" | "full";
	contextWindow: number | null;
	systemPromptText: string;
	runtimeTools: readonly AgentToolBinding[];
	summarizeContext?: (input: {
		text: string;
		originalCount: number;
		strategy: "compact" | "summarized";
	}) => Promise<string>;
}

type PreparedHistoryForRuntime = {
	history: AgentHistoryMessage[];
	contextCompacted?: NonNullable<Message["metadata"]>["contextCompacted"];
	contextCompactedEvent?: ContextCompactedProductEventInput;
	summaryInput?: string;
	metadata: {
		mode: "auto" | "compact" | "full";
		strategy: "full" | "sliding" | "compact" | "summarized";
		omittedCount: number;
		estimatedTokens: number;
		availableForMessages: number | null;
		historyCount: number;
		compacted: boolean;
	};
};

export function prepareHistoryForRuntime({
	messages,
	contextCount,
	contextMode,
	contextWindow,
	systemPromptText,
	runtimeTools,
}: PrepareHistoryForRuntimeInput): PreparedHistoryForRuntime {
	const historicalMessages = messages.slice(0, -2);
	const toolsText = runtimeTools
		.map((tool) =>
			JSON.stringify({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema,
			}),
		)
		.join("\n");
	const result = applyContextStrategy({
		messages: historicalMessages,
		contextCount,
		contextMode,
		budget: {
			contextWindow,
			systemPromptTokens: estimateTokensSync(systemPromptText),
			toolsTokens: estimateTokensSync(toolsText),
		},
	});
	const metadata = {
		mode: result.mode,
		strategy: result.strategy,
		omittedCount: result.omittedCount,
		estimatedTokens: result.estimatedTokens,
		availableForMessages: result.budget.availableForMessages,
		historyCount: result.history.length,
		compacted: Boolean(result.summaryMessage),
	};
	const compactedMarker = result.summaryMessage?.metadata?.contextCompacted;
	const contextCompactedEvent =
		result.summaryMessage && compactedMarker
			? {
					summaryMessageId: result.summaryMessage.id,
					summary: compactedMarker.summary ?? result.summaryMessage.content,
					originalCount: compactedMarker.originalCount ?? result.omittedCount,
					compactedAt:
						compactedMarker.compactedAt ?? result.summaryMessage.timestamp,
					strategy: metadata,
					estimatedTokens: result.estimatedTokens,
					summarySource: "fallback" as const,
				}
			: undefined;
	return {
		history: result.history,
		contextCompacted: compactedMarker,
		contextCompactedEvent,
		summaryInput: result.summaryInput,
		metadata,
	};
}

export async function prepareHistoryForRuntimeWithSummary(
	input: PrepareHistoryForRuntimeInput,
): Promise<PreparedHistoryForRuntime> {
	const prepared = prepareHistoryForRuntime(input);
	if (
		!input.summarizeContext ||
		!prepared.summaryInput ||
		!prepared.contextCompacted ||
		!prepared.contextCompactedEvent ||
		(prepared.metadata.strategy !== "compact" &&
			prepared.metadata.strategy !== "summarized")
	) {
		return prepared;
	}

	let summary: string;
	try {
		summary = (
			await input.summarizeContext({
				text: prepared.summaryInput,
				originalCount: prepared.contextCompacted.originalCount,
				strategy: prepared.metadata.strategy,
			})
		).trim();
	} catch (error) {
		agentLog.warn("Context LLM summarization failed; using fallback summary", {
			error: error instanceof Error ? error.message : String(error),
		});
		return prepared;
	}
	if (!summary) return prepared;

	const history = prepared.history.map((item, index) => {
		if (index !== 0 || item.role !== "assistant") return item;
		return {
			...item,
			content: item.content.map((part, partIndex) =>
				partIndex === 0 && part.type === "text"
					? { ...part, text: summary }
					: part,
			),
		};
	});
	return {
		...prepared,
		history,
		contextCompacted: {
			...prepared.contextCompacted,
			summary,
		},
		contextCompactedEvent: {
			...prepared.contextCompactedEvent,
			summary,
			summarySource: "llm",
		},
	};
}

export function getPinnedContextSources(
	messages: Message[],
): MessageContextSource[] {
	for (let i = messages.length - 1; i >= 0; i--) {
		const sources = messages[i].metadata?.contextSources?.filter(
			(source) => source.pinned,
		);
		if (sources?.length) {
			return sources.map((source) => ({ ...source, pinned: true }));
		}
	}
	return [];
}

export function mergePinnedContextSources(
	sources: MessageContextSource[],
	pinnedSources: MessageContextSource[],
): MessageContextSource[] {
	if (pinnedSources.length === 0) return sources;
	const pinnedById = new Map(
		pinnedSources.map((source) => [source.id, source] as const),
	);
	return sources.map((source) => {
		const pinnedSource = pinnedById.get(source.id);
		if (!pinnedSource) return source;
		return { ...source, pinned: true };
	});
}

export function buildContextMetadataForRuntime(input: {
	promptContext: BuildPromptContextOutput;
	historyMetadata: ReturnType<typeof prepareHistoryForRuntime>["metadata"];
	runtimeToolCount: number;
	pinnedSources?: MessageContextSource[];
}): {
	contextSources: MessageContextSource[];
	contextStrategy: MessageContextStrategy;
} {
	const sources: MessageContextSource[] = [];

	sources.push({
		id: "system-prompt",
		kind: "systemPrompt",
		label: "System prompt",
		injected: true,
	});

	if (input.promptContext.cwd) {
		sources.push({
			id: "project-rules",
			kind: "projectRules",
			label: "Project rules runtime check",
			detail: "AGENTS.md / CLAUDE.md",
			injected: false,
		});
	}

	if (input.promptContext.attachmentCount > 0) {
		sources.push({
			id: "attachments",
			kind: "attachment",
			label:
				input.promptContext.attachmentCount === 1
					? "1 attachment"
					: `${input.promptContext.attachmentCount} attachments`,
			detail: "Current turn",
			injected: true,
		});
	}

	if (input.promptContext.searchResultCount > 0) {
		sources.push({
			id: "search-results",
			kind: "search",
			label:
				input.promptContext.searchResultCount === 1
					? "1 search result"
					: `${input.promptContext.searchResultCount} search results`,
			injected: true,
		});
	}

	if (input.historyMetadata.historyCount > 0) {
		sources.push({
			id: "conversation-history",
			kind: "history",
			label:
				input.historyMetadata.historyCount === 1
					? "1 history message"
					: `${input.historyMetadata.historyCount} history messages`,
			detail:
				input.historyMetadata.omittedCount > 0
					? `${input.historyMetadata.omittedCount} omitted`
					: undefined,
			injected: true,
		});
	}

	if (input.runtimeToolCount > 0) {
		sources.push({
			id: "runtime-tools",
			kind: "other",
			label:
				input.runtimeToolCount === 1
					? "1 runtime tool"
					: `${input.runtimeToolCount} runtime tools`,
			injected: true,
		});
	}

	return {
		contextSources: mergePinnedContextSources(sources, input.pinnedSources ?? []),
		contextStrategy: {
			mode: input.historyMetadata.mode,
			strategy: input.historyMetadata.strategy,
			historyCount: input.historyMetadata.historyCount,
			omittedCount: input.historyMetadata.omittedCount,
			estimatedTokens: input.historyMetadata.estimatedTokens,
			availableForMessages: input.historyMetadata.availableForMessages,
			compacted: input.historyMetadata.compacted,
		},
	};
}

export async function persistContextCompactedEventForRuntime(
	input: {
		conversationId: string;
		requestId: string;
		runtimeId: string;
		model?: string;
		contextCompactedEvent?: ContextCompactedProductEventInput;
	},
	deps: {
		appendSessionEvent?: (
			sessionId: string,
			event: SessionEvent,
		) => Promise<unknown> | unknown;
		log?: {
			warn: (message: string, meta?: Record<string, unknown>) => void;
		};
	},
): Promise<void> {
	if (!input.contextCompactedEvent || !deps.appendSessionEvent) return;
	const events = createContextCompactedSessionEvents(
		{
			...input.contextCompactedEvent,
			...(input.model ? { model: input.model } : {}),
		},
		{
			sessionId: input.conversationId,
			requestId: input.requestId,
			runId: input.runtimeId,
			eventIdPrefix: `context-${input.requestId}`,
		},
	);
	for (const event of events) {
		try {
			await deps.appendSessionEvent(input.conversationId, event);
		} catch (error) {
			deps.log?.warn("Context compacted event persistence failed", {
				requestId: input.requestId,
				conversationId: input.conversationId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
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
		updateMessageMetadata: (
			messageId: string,
			metadata: Partial<NonNullable<Message["metadata"]>>,
		) => void;
		appendSessionEvent?: (
			sessionId: string,
			event: SessionEvent,
		) => Promise<unknown> | unknown;
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
	getSessionSettings: () => {
		systemPrompt?: string;
		contextCount?: number;
		contextMode?: "auto" | "compact" | "full";
	};
	getMessages: () => Message[];
	summarizeContext?: PrepareHistoryForRuntimeInput["summarizeContext"];
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
				getMessages,
				summarizeContext,
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
				const runtimePromptText = buildAgentRuntimePromptText(
					promptContext.prompt,
					customSystemPrompt,
				);
				const currentMessages = getMessages();
				const runtimeSummarizeContext =
					summarizeContext ??
					createContextSummarizer({
						provider: effective?.provider,
						model: effective?.model,
						conversationId: convId,
						requestId,
					});
				const historyContext = await prepareHistoryForRuntimeWithSummary({
					messages: currentMessages,
					contextCount: sessionSettings.contextCount ?? -1,
					contextMode: sessionSettings.contextMode ?? "auto",
					contextWindow: effective?.model.contextWindow ?? null,
					systemPromptText: customSystemPrompt,
					runtimeTools,
					summarizeContext: runtimeSummarizeContext,
				});
				const currentAssistant = currentMessages[currentMessages.length - 1];
				if (currentAssistant?.role === "assistant") {
					const contextMetadata = buildContextMetadataForRuntime({
						promptContext,
						historyMetadata: historyContext.metadata,
						runtimeToolCount: runtimeTools.length,
						pinnedSources: getPinnedContextSources(currentMessages),
					});
					messageStoreApi.updateMessageMetadata(currentAssistant.id, {
						...contextMetadata,
						...(historyContext.contextCompacted
							? { contextCompacted: historyContext.contextCompacted }
							: {}),
					});
				}
				agentLog.info("Agent history context prepared", {
					requestId,
					conversationId: convId,
					...historyContext.metadata,
				});

				runController.setRequestType("runtime");
				const createQuery =
					runtime?.createQuery ?? agentRuntimeClient.createQuery;
				const { runtimeId } = await createQuery({
					requestId,
					conversationId: convId,
					prompt: {
						kind: "text",
						text: runtimePromptText,
					},
					history: historyContext.history,
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
				await persistContextCompactedEventForRuntime(
					{
						conversationId: convId,
						requestId,
						runtimeId,
						model: effective?.model.id,
						contextCompactedEvent: historyContext.contextCompactedEvent,
					},
					{
						appendSessionEvent: messageStoreApi.appendSessionEvent,
						log: agentLog,
					},
				);
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
