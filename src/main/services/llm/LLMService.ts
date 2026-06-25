import { BrowserWindow } from "electron";
import { stepCountIs, streamText } from "ai";
import { LLM_CHANNELS } from "../../ipc/channels";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
	ModelProviderPreset,
	ProviderModel,
	TestConnectionResponse,
	ToolPermissionConfig,
} from "../../ipc/types";
import { getApprovalGrantStore } from "../runtime/ApprovalGrantStore";
import { getRuntimePolicyService } from "../runtime/RuntimePolicyService";
import { getSessionRuntimeResolver } from "../runtime/SessionRuntimeResolver";
import { logger } from "../../utils/logger";
import {
	buildLLMErrorContext,
	formatLLMErrorMessage,
} from "./errorContext";
import { applyPlanModeGate } from "./planModeGate";
import { drainFullStream } from "./streamEventBridge";
import { mapExtraParams } from "./extraParamsMapper";
import { toModelMessages } from "./messageMapper";
import { normalizeModels } from "./modelNormalizer";
import { resolveProvider } from "./providers";
import { buildToolSet } from "./toolAdapter";
import type { RuntimeOperationKind } from "@super-client/shared-types/chat";

// ─── Runtime policy audit helpers (private) ──────────────────────────────────

function classifyToolKind(toolName: string): RuntimeOperationKind {
	// toolName might be prefixed (e.g. "@scp/file-system:write_file") or bare.
	const bare = toolName.includes(":")
		? (toolName.split(":").pop() ?? toolName)
		: toolName;
	if (
		bare.includes("write") ||
		bare.includes("create_file") ||
		bare.includes("edit")
	)
		return "file-write";
	if (bare.includes("delete") || bare.includes("remove")) return "file-delete";
	if (bare.includes("read") || bare.includes("list") || bare.includes("info"))
		return "file-read";
	if (bare === "bash" || bare === "exec" || bare.includes("execute"))
		return "command-exec";
	if (
		bare.includes("fetch") ||
		bare.includes("request") ||
		bare.includes("http")
	)
		return "network-request";
	return "tool-execute";
}

function extractTarget(_toolName: string, args: unknown): string | undefined {
	if (!args || typeof args !== "object") return undefined;
	const obj = args as Record<string, unknown>;
	for (const key of ["path", "file", "filePath", "filename", "url"]) {
		if (typeof obj[key] === "string") return obj[key] as string;
	}
	return undefined;
}

export interface ToolExecuteOptions {
	/**
	 * Caller has already collected a one-shot approval from the user via the
	 * `tool_approval_request` event. The executor must propagate this into
	 * the underlying tool dispatch so the runtime-policy gate downgrades any
	 * `needs-approval` decision to `allow`.
	 */
	approvalGranted?: boolean;
}

export type ToolExecutor = (
	name: string,
	args: Record<string, unknown>,
	options?: ToolExecuteOptions,
) => Promise<unknown>;

/**
 * Thrown by `ToolExecutor` when `mcpService.callTool` returns a runtime-policy
 * `needs-approval` denial. Carries the policy `code` so the caller
 * (`toolAdapter`) can distinguish "ask the user" from a permanent failure.
 *
 * Subclasses `Error` so existing `try/catch` paths keep treating it as a
 * tool failure if they don't know to look for it.
 */
export class RuntimeApprovalRequiredError extends Error {
	readonly code: string;
	constructor(message: string, code: string) {
		super(message);
		this.name = "RuntimeApprovalRequiredError";
		this.code = code;
	}
}

const log = logger.withContext("LLMService");

export class LLMService {
	private activeStreams = new Map<string, AbortController>();
	// Pending tool approval requests awaiting user response. `requestId`
	// is tracked so `stopStream` can release any approvals tied to an
	// aborted stream — otherwise the Promise leaks until process exit.
	private pendingApprovals = new Map<
		string,
		{ resolve: (approved: boolean) => void; requestId: string }
	>();
	// Chat hook registry (injected from PluginManager)
	private chatHookRegistry:
		| import("../plugin/hooks/ChatHooks").ChatHookRegistry
		| null = null;
	// Per-request stream event subscribers. Used by HTTP entry points
	// (`src/main/server/routes/llm.ts`) to deliver SSE to a single client
	// without involving BrowserWindow broadcasts.
	private streamSubscribers = new Map<
		string,
		Set<(event: ChatStreamEvent) => void>
	>();

	/**
	 * Subscribe to stream events for a single `requestId`. Returns an
	 * unsubscribe function. Multiple subscribers per requestId are supported.
	 *
	 * Events are still broadcast to every BrowserWindow via `broadcast` so the
	 * renderer IPC consumers continue to work; this is an *additional* fan-out
	 * for the local HTTP server.
	 */
	subscribeRequestEvents(
		requestId: string,
		listener: (event: ChatStreamEvent) => void,
	): () => void {
		let set = this.streamSubscribers.get(requestId);
		if (!set) {
			set = new Set();
			this.streamSubscribers.set(requestId, set);
		}
		set.add(listener);
		return () => {
			const s = this.streamSubscribers.get(requestId);
			if (!s) return;
			s.delete(listener);
			if (s.size === 0) this.streamSubscribers.delete(requestId);
		};
	}

	/**
	 * Set the chat hook registry for plugin integration
	 */
	setChatHookRegistry(
		registry: import("../plugin/hooks/ChatHooks").ChatHookRegistry,
	): void {
		this.chatHookRegistry = registry;
	}

	/**
	 * Check tool permission and optionally request user approval.
	 * Returns true if the tool is allowed to execute.
	 */
	private async checkToolPermission(
		requestId: string,
		permission: ToolPermissionConfig | undefined,
		toolCallId: string,
		toolName: string,
		toolArgs: string,
		conversationId?: string,
	): Promise<boolean> {
		if (!permission || permission.mode === "auto") return true;
		if (permission.mode === "none") return false;
		if (
			permission.mode === "approve_except_authorized" &&
			permission.authorizedTools?.includes(toolName)
		) {
		return true;
	}

		// Consult existing approval grants before prompting the user.
		const operationType = `tool:${toolName}`;
		if (conversationId) {
			const grant = getApprovalGrantStore().findGrant({
				conversationId,
				operationType,
			});
			if (grant) {
				return true;
			}
		}
		// approve_always or approve_except_authorized with unauthorized tool
		this.broadcast({
			requestId,
			type: "tool_approval_request",
			toolApproval: {
				toolCallId,
				name: toolName,
				arguments: toolArgs,
				source: "tool-permission",
			},
		});
		const approved = await new Promise<boolean>((resolve) => {
			this.pendingApprovals.set(toolCallId, { resolve, requestId });
		});
		if (!approved && conversationId) {
			getApprovalGrantStore().recordDeny(
				conversationId,
				"",
				operationType,
				undefined,
				"user-rejected",
			);
		}
		return approved;
	}

	/**
	 * Prompt the user for a one-shot runtime-policy approval. Shares the
	 * `tool_approval_request` channel with `checkToolPermission` (and thus
	 * the renderer-side `ApprovalDecisionCard`) so the renderer needs no new
	 * event type. Carries the policy `code` and human-readable `reason` so
	 * the prompt can show *why* approval is required.
	 */
	private async awaitToolRuntimeApproval(
		requestId: string,
		toolCallId: string,
		toolName: string,
		toolArgs: string,
		code: string,
		reason: string,
	): Promise<boolean> {
		this.broadcast({
			requestId,
			type: "tool_approval_request",
			toolApproval: {
				toolCallId,
				name: toolName,
				arguments: toolArgs,
				source: "runtime-policy",
				code,
				reason,
			},
		});
		return new Promise<boolean>((resolve) => {
			this.pendingApprovals.set(toolCallId, { resolve, requestId });
		});
	}

	private evaluateToolRuntimePolicy(
		conversationId: string | undefined,
		toolName: string,
		args: Record<string, unknown>,
	): { allowed: true } | { allowed: false; code: string; message: string } {
		const kind = classifyToolKind(toolName);
		const target = extractTarget(toolName, args);
		const fallbackCtx = {
			workspaceId: "",
			sessionId: conversationId,
			source: "llm" as const,
			operation: toolName,
			kind,
			target,
			input: args,
		};

		if (!conversationId) {
			getRuntimePolicyService().record(
				fallbackCtx,
				"audit-only",
				"no-session",
			);
			return { allowed: true };
		}

		try {
			const runtime = getSessionRuntimeResolver().resolve({
				sessionId: conversationId,
			});
			const ctx = {
				...fallbackCtx,
				workspaceId: runtime.workspaceId,
				sessionId: conversationId,
			};
			const evaluation = getRuntimePolicyService().evaluate(
				ctx,
				runtime.runtimePolicy,
			);
			if (
				evaluation.decision === "deny" ||
				evaluation.decision === "needs-approval"
			) {
				getRuntimePolicyService().record(ctx, "denied", evaluation.reason);
				return {
					allowed: false,
					code: evaluation.code ?? "runtime.policyDenied",
					message: evaluation.reason ?? "runtime-policy-denied",
				};
			}
			getRuntimePolicyService().record(
				ctx,
				evaluation.reason?.startsWith("audit-only") ? "audit-only" : "allowed",
				evaluation.reason,
			);
			return { allowed: true };
		} catch {
			getRuntimePolicyService().record(
				fallbackCtx,
				"audit-only",
				"runtime-resolver-failed",
			);
			return { allowed: true };
		}
	}

	/**
	 * Resolve a pending tool approval request from the renderer.
	 */
	resolveToolApproval(toolCallId: string, approved: boolean): void {
		const pending = this.pendingApprovals.get(toolCallId);
		if (pending) {
			pending.resolve(approved);
			this.pendingApprovals.delete(toolCallId);
		} else {
			console.warn(
				"[LLMService] resolveToolApproval: no pending approval for",
				toolCallId,
				"| map keys:",
				[...this.pendingApprovals.keys()],
			);
		}
	}

	async testConnection(
		baseUrl: string,
		apiKey: string,
	): Promise<TestConnectionResponse> {
		const start = Date.now();
		try {
			const url = `${baseUrl.replace(/\/$/, "")}/models`;
			const res = await fetch(url, {
				headers: { Authorization: `Bearer ${apiKey || "sk-placeholder"}` },
			});
			const latencyMs = Date.now() - start;
			if (!res.ok) {
				return {
					success: false,
					latencyMs,
					error: `HTTP ${res.status} ${res.statusText}`.trim(),
				};
			}
			return { success: true, latencyMs };
		} catch (error: unknown) {
			const latencyMs = Date.now() - start;
			const message =
				error instanceof Error ? error.message : "Connection failed";
			return { success: false, latencyMs, error: message };
		}
	}

	async fetchModels(
		baseUrl: string,
		apiKey: string,
		preset?: ModelProviderPreset,
	): Promise<ProviderModel[]> {
		const url = `${baseUrl.replace(/\/$/, "")}/models`;
		const res = await fetch(url, {
			headers: { Authorization: `Bearer ${apiKey || "sk-placeholder"}` },
		});
		if (!res.ok) {
			throw new Error(
				`Failed to fetch models: HTTP ${res.status} ${res.statusText}`.trim(),
			);
		}
		const json = (await res.json()) as { data?: Array<{ id: string }> };
		const rawModels = (json.data ?? []).map((m) => ({
			id: m.id,
			name: m.id,
		}));
		rawModels.sort((a, b) => a.id.localeCompare(b.id));
		return normalizeModels(rawModels, preset);
	}

	/**
	 * R-5 — Plan-mode gate (delegates to ./planModeGate).
	 *
	 * Kept as a private method (rather than calling the imported function
	 * directly) so future overrides / instrumentation have one seam.
	 */
	private applyPlanModeGate(
		request: ChatCompletionRequest,
		toolExecutor: ToolExecutor | undefined,
	): {
		request: ChatCompletionRequest;
		toolExecutor: ToolExecutor | undefined;
	} {
		return applyPlanModeGate(request, toolExecutor);
	}

	/**
	 * Public chat completion entry.
	 *
	 * Always delegates to `chatCompletionUnified` (Vercel AI SDK). Prompt-mode
	 * (`toolCallMode === "prompt"`) — the legacy `<tool_call>` XML sentinel
	 * loop used by DeepSeek-R1 — is no longer supported after the unified-path
	 * cutover. Callers requesting it get an explicit error rather than a
	 * silent single-step response.
	 *
	 * Fire-and-forget contract preserved: stream events are broadcast via
	 * `broadcast()` to BrowserWindows + per-request subscribers. The promise
	 * returned here just lets callers `await` the completion if they want to.
	 */
	async chatCompletion(
		rawRequest: ChatCompletionRequest,
		rawToolExecutor?: ToolExecutor,
	): Promise<void> {
		if (rawRequest.toolCallMode === "prompt") {
			throw new Error(
				"toolCallMode='prompt' is no longer supported after the unified-path cutover.",
			);
		}
		return this.chatCompletionUnified(rawRequest, rawToolExecutor);
	}

	/**
	 * Unified chat completion via the Vercel AI SDK. Same public contract
	 * as `chatCompletion`: fire-and-forget, side effects via `broadcast`.
	 *
	 * Preserves every legacy side effect:
	 *   - plan-mode gate
	 *   - preSend / systemPrompt / postResponse hooks
	 *   - approval gate (per-tool, via tool adapter)
	 *   - runtime policy gate (per-tool, via tool adapter)
	 *   - per-request stream subscribers (via broadcast)
	 *   - stopStream + abort signal silently halts
	 *   - postResponse hook delta broadcast as a tail `chunk` event
	 */
	private async chatCompletionUnified(
		rawRequest: ChatCompletionRequest,
		rawToolExecutor?: ToolExecutor,
	): Promise<void> {
		const gated = this.applyPlanModeGate(rawRequest, rawToolExecutor);
		const request = gated.request;
		const toolExecutor = gated.toolExecutor;

		const controller = new AbortController();
		this.activeStreams.set(request.requestId, controller);

		const messages = toModelMessages(request.messages).slice();

		// preSend hook parity
		if (this.chatHookRegistry?.hasHooks("preSend")) {
			const ctx: import("../plugin/types").PreSendHookContext = {
				messages: messages.map((m) => ({
					role: String((m as { role: string }).role),
					content:
						typeof (m as { content?: unknown }).content === "string"
							? (m as { content: string }).content
							: JSON.stringify((m as { content?: unknown }).content ?? ""),
				})),
			};
			await this.chatHookRegistry.runPreSendHooks(ctx);
			if (ctx.cancelled) {
				this.broadcast({ requestId: request.requestId, type: "done" });
				this.activeStreams.delete(request.requestId);
				return;
			}
		}

		// systemPrompt hook parity
		if (this.chatHookRegistry?.hasHooks("systemPrompt")) {
			const first = messages[0];
			if (
				first &&
				first.role === "system" &&
				typeof first.content === "string"
			) {
				const ctx = { systemPrompt: first.content };
				await this.chatHookRegistry.runSystemPromptHooks(ctx);
				(first as { content: string }).content = ctx.systemPrompt;
			}
		}

		const model = resolveProvider({
			preset: request.providerPreset,
			apiFormat: request.apiFormat,
			baseUrl: request.baseUrl,
			apiKey: request.apiKey,
			model: request.model,
		});

		const toolSet = buildToolSet({
			request,
			toolExecutor,
			broadcast: (e) => this.broadcast(e),
			checkPermission: ({ toolCallId, toolName, toolArgs }) =>
				this.checkToolPermission(
					request.requestId,
					request.toolPermission,
					toolCallId,
					toolName,
					toolArgs,
					request.conversationId,
				),
			evaluateRuntimePolicy: (toolName, args) =>
				this.evaluateToolRuntimePolicy(
					request.conversationId,
					toolName,
					args,
				),
			awaitRuntimeApproval: ({
				toolCallId,
				toolName,
				toolArgs,
				code,
				message,
			}) =>
				this.awaitToolRuntimeApproval(
					request.requestId,
					toolCallId,
					toolName,
					toolArgs,
					code,
					message,
				),
		});

		const mapped = mapExtraParams(
			request.providerPreset,
			request.extraParams,
			request.apiFormat,
		);

		// Tee chunk events into an accumulator so the postResponse hook can
		// compute a delta. Otherwise plugins that mutate the response would
		// see no visible effect (legacy broadcast the tail diff as a chunk).
		const startTime = Date.now();
		let accumulatedText = "";
		const taggingBroadcast = (e: ChatStreamEvent) => {
			if (e.type === "chunk" && typeof e.content === "string") {
				accumulatedText += e.content;
			}
			this.broadcast(e);
		};

		try {
			const result = streamText({
				model,
				messages,
				tools: toolSet,
				stopWhen: stepCountIs(10),
				abortSignal: controller.signal,
				temperature: request.temperature ?? 0.7,
				topP: request.topP,
				maxOutputTokens: request.maxTokens ?? 4096,
				...mapped.top,
				// extraParams flow in from IPC / HTTP and are guaranteed to be
				// JSON-serialisable, so the AI SDK's stricter JSONObject typing
				// is satisfied at runtime even though it doesn't follow from
				// the looser `Record<string, unknown>` we use upstream.
				providerOptions:
					Object.keys(mapped.providerOptions).length > 0
						? (mapped.providerOptions as Parameters<
								typeof streamText
							>[0]["providerOptions"])
						: undefined,
			});

			await drainFullStream(result.fullStream, {
					requestId: request.requestId,
					broadcast: taggingBroadcast,
					startTime,
					abortSignal: controller.signal,
					// Pass the originating request so the bridge can build a
					// structured `LLMErrorContext` (HTTP / response body /
					// stack / parsed provider error) when streamText surfaces
					// an `error` part or throws during iteration — the outer
					// catch below doesn't fire in that case because the
					// bridge already broadcasts the failure itself.
					request,
				});

			// postResponse hook: broadcast tail delta if hook mutated the
			// response, matching legacy behaviour.
			if (
				!controller.signal.aborted &&
				accumulatedText &&
				this.chatHookRegistry?.hasHooks("postResponse")
			) {
				const ctx = { response: accumulatedText };
				await this.chatHookRegistry.runPostResponseHooks(ctx);
				if (ctx.response !== accumulatedText) {
					const tail = ctx.response.slice(accumulatedText.length);
					if (tail) {
						this.broadcast({
							requestId: request.requestId,
							type: "chunk",
							content: tail,
						});
					}
				}
			}
		} catch (error: unknown) {
			if (controller.signal.aborted) return;
			// Enrich the bare SDK message with request context — apiFormat /
			// baseUrl / model / HTTP status — so config mismatches surface
			// clearly to both the renderer and the main-process log.
			const enriched = formatLLMErrorMessage(error, request);
			const errorContext = buildLLMErrorContext(error, request);
			log.error(
				"LLM stream failed",
				error instanceof Error ? error : new Error(String(error)),
				errorContext,
			);
			// Broadcast both the legacy flattened string (for HTTP SSE clients
			// and any older consumer) and the structured context that drives
			// the renderer's ErrorCard.
			this.broadcast({
				requestId: request.requestId,
				type: "error",
				error: enriched,
				errorContext,
			});
		} finally {
			this.activeStreams.delete(request.requestId);
		}
	}

	stopStream(requestId: string): boolean {
		// Release any tool approvals parked on this request so the await
		// inside `toolAdapter` resolves and the executor cleans up promptly.
		// Without this, an abort mid-prompt leaks the Promise (and its
		// upstream tool execution) until process exit.
		for (const [toolCallId, pending] of this.pendingApprovals.entries()) {
			if (pending.requestId === requestId) {
				pending.resolve(false);
				this.pendingApprovals.delete(toolCallId);
			}
		}
		const controller = this.activeStreams.get(requestId);
		if (controller) {
			controller.abort();
			this.activeStreams.delete(requestId);
			return true;
		}
		return false;
	}

	private broadcast(event: ChatStreamEvent): void {
		// Renderer windows (IPC consumers).
		BrowserWindow.getAllWindows().forEach((win) => {
			if (!win.isDestroyed()) {
				win.webContents.send(LLM_CHANNELS.STREAM_EVENT, event);
			}
		});
		// Per-request HTTP subscribers (SSE).
		const subs = this.streamSubscribers.get(event.requestId);
		if (subs && subs.size > 0) {
			for (const listener of subs) {
				try {
					listener(event);
				} catch {
					// Subscriber errors must not poison the broadcast loop.
				}
			}
		}
	}
}

export const llmService = new LLMService();
