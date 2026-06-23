/**
 * LLM API 路由
 *
 * Exposes provider model listing and streaming chat completion via the local
 * HTTP server so external clients can call them with the same Bearer API key
 * and have requests logged through `requestLogger`.
 *
 * Renderer-side fetch-models is migrated to call `POST /v1/llm/models` here
 * (replacing the direct IPC path). The streaming chat completion endpoint is
 * added for external clients only — the renderer currently has no plain-chat
 * code path (everything goes through Agent SDK), so the existing IPC channels
 * are left in place for any future renderer use.
 */

import {
	body,
	request,
	summary,
	tags,
	description,
} from "koa-swagger-decorator";
import type Koa from "koa";
import { randomUUID } from "crypto";
import { llmService } from "../../services/llm";
import { buildToolExecutorFromRequest } from "../../services/llm/toolExecutorFactory";
import { logger } from "../../utils/logger";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
	ModelProviderPreset,
} from "../../ipc/types";

const tag = tags(["LLM"]);
const log = logger.withContext("LLMRoute");

interface ApiResponse<T = unknown> {
	code: number;
	message: string;
	data?: T;
	timestamp: number;
}

function createResponse<T>(
	ctx: Koa.Context,
	code: number,
	message: string,
	data?: T,
): ApiResponse<T> {
	ctx.status = code;
	return {
		code,
		message,
		data,
		timestamp: Date.now(),
	};
}

export class LLMController {
	// =================== Fetch Models ===================

	@request("post", "/v1/llm/models")
	@summary("拉取 Provider 的模型列表")
	@description(
		"通过 provider 的 baseUrl + apiKey 调用其 /v1/models 接口，返回规范化后的模型清单。等价于设置页里的「Fetch Models」按钮。apiKey 仅本次请求使用，不会被持久化或写入日志。",
	)
	@tag
	@body({
		baseUrl: {
			type: "string",
			required: true,
			description: "Provider base URL，例如 https://api.openai.com/v1",
		},
		apiKey: {
			type: "string",
			required: true,
			description: "Provider API Key（一次性使用，不持久化）",
		},
		preset: {
			type: "string",
			required: false,
			description:
				"Provider preset (openai/anthropic/openrouter/...)，用于模型元数据规范化",
		},
	})
	async fetchModels(ctx: Koa.Context) {
		try {
			const { baseUrl, apiKey, preset } = (ctx.request.body ?? {}) as {
				baseUrl?: string;
				apiKey?: string;
				preset?: ModelProviderPreset;
			};
			if (!baseUrl) {
				ctx.body = createResponse(ctx, 400, "baseUrl is required");
				return;
			}
			const models = await llmService.fetchModels(
				baseUrl,
				apiKey || "",
				preset,
			);
			ctx.body = createResponse(ctx, 200, "Success", { models });
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to fetch models",
			);
		}
	}

	// =================== Test Connection ===================

	@request("post", "/v1/llm/test-connection")
	@summary("探测 Provider 可达性")
	@description("用 provider 的 baseUrl + apiKey 发起一次轻量请求，确认连通性。")
	@tag
	@body({
		baseUrl: { type: "string", required: true, description: "Provider base URL" },
		apiKey: {
			type: "string",
			required: true,
			description: "Provider API Key（一次性使用）",
		},
	})
	async testConnection(ctx: Koa.Context) {
		try {
			const { baseUrl, apiKey } = (ctx.request.body ?? {}) as {
				baseUrl?: string;
				apiKey?: string;
			};
			if (!baseUrl) {
				ctx.body = createResponse(ctx, 400, "baseUrl is required");
				return;
			}
			const result = await llmService.testConnection(baseUrl, apiKey || "");
			ctx.body = createResponse(ctx, 200, "Success", result);
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to test connection",
				{ success: false, latencyMs: 0 },
			);
		}
	}

	// =================== Chat Completion (SSE) ===================

	@request("post", "/v1/llm/chat/completions")
	@summary("流式聊天补全（SSE）")
	@description(
		[
			"以 Server-Sent Events 形式返回流式补全事件。响应 Content-Type 是 text/event-stream。",
			"事件 type 包括：chunk / tool_call / tool_result / tool_error / tool_approval_request / tool_rejected / done / error。",
			"客户端可使用 EventSource 或 fetch().body.getReader() 读取。客户端断开连接时会自动 stop 当前 stream。",
		].join("\n"),
	)
	@tag
	@body({
		requestId: {
			type: "string",
			required: false,
			description: "请求 ID（可选，缺省时服务端自动生成 UUID）",
		},
		baseUrl: { type: "string", required: true, description: "Provider base URL" },
		apiKey: { type: "string", required: true, description: "Provider API Key" },
		model: { type: "string", required: true, description: "模型 ID" },
		messages: {
			type: "array",
			required: true,
			description: "OpenAI 风格的消息数组（支持 user/assistant/system/tool）",
		},
		maxTokens: { type: "number", required: false },
		temperature: { type: "number", required: false },
		topP: { type: "number", required: false },
		stream: { type: "boolean", required: false, default: true },
		tools: {
			type: "array",
			required: false,
			description: "OpenAI function calling 工具定义",
		},
		toolMapping: {
			type: "object",
			required: false,
			description: "工具名 → { serverId, toolName } 的映射，用于把模型选的工具派发到本地 MCP / skill",
		},
		toolPermission: {
			type: "object",
			required: false,
			description: "工具调用授权策略 (mode: none/auto/approve_always/approve_except_authorized)",
		},
		toolCallMode: {
			type: "string",
			required: false,
			enum: ["function", "prompt"],
			description: "function = 原生 function calling；prompt = 把工具注入 system prompt 并解析文本中的 <tool_call>",
		},
		providerPreset: {
			type: "string",
			required: false,
			description: "Provider preset（影响特殊 header / 分发到 Anthropic SDK）",
		},
		extraParams: { type: "object", required: false },
		conversationId: {
			type: "string",
			required: false,
			description: "会话 ID（用于解析工作目录、把工具调用 scope 到对话）",
		},
		toolTimeout: {
			type: "number",
			required: false,
			default: 180,
			description: "工具调用超时秒数",
		},
	})
	async chatCompletion(ctx: Koa.Context) {
		const raw = (ctx.request.body ?? {}) as Partial<ChatCompletionRequest>;
		if (!raw.baseUrl || !raw.model || !raw.messages) {
			ctx.body = createResponse(
				ctx,
				400,
				"baseUrl, model and messages are required",
			);
			return;
		}

		// Fill in defaults so the request matches the IPC contract.
		const fullRequest: ChatCompletionRequest = {
			requestId: raw.requestId ?? `req-${randomUUID()}`,
			baseUrl: raw.baseUrl,
			apiKey: raw.apiKey ?? "",
			model: raw.model,
			messages: raw.messages,
			maxTokens: raw.maxTokens,
			temperature: raw.temperature,
			topP: raw.topP,
			stream: raw.stream ?? true,
			tools: raw.tools,
			toolMapping: raw.toolMapping,
			toolPermission: raw.toolPermission,
			toolCallMode: raw.toolCallMode,
			providerPreset: raw.providerPreset,
			extraParams: raw.extraParams,
			conversationId: raw.conversationId,
			toolTimeout: raw.toolTimeout,
		};

		// Switch to raw streaming response. We write SSE frames directly to the
		// underlying socket and tell Koa not to write `ctx.body` for us.
		ctx.respond = false;
		const res = ctx.res;
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.flushHeaders?.();

		let cleanedUp = false;
		const cleanup = () => {
			if (cleanedUp) return;
			cleanedUp = true;
			unsubscribe();
			try {
				if (!res.writableEnded) res.end();
			} catch {
				// already closed
			}
		};

		const writeEvent = (event: ChatStreamEvent) => {
			if (cleanedUp) return;
			try {
				res.write(`event: ${event.type}\n`);
				res.write(`data: ${JSON.stringify(event)}\n\n`);
			} catch (err) {
				log.warn("Failed to write SSE event", {
					requestId: fullRequest.requestId,
					err: err instanceof Error ? err.message : String(err),
				});
				cleanup();
			}
		};

		const unsubscribe = llmService.subscribeRequestEvents(
			fullRequest.requestId,
			(event) => {
				writeEvent(event);
				if (event.type === "done" || event.type === "error") {
					cleanup();
				}
			},
		);

		ctx.req.on("close", () => {
			if (!cleanedUp) {
				llmService.stopStream(fullRequest.requestId);
				cleanup();
			}
		});

		try {
			const toolExecutor = buildToolExecutorFromRequest(fullRequest);
			// Fire and forget — events flow through the subscriber. Errors from
			// the underlying call still need to be surfaced as an SSE `error`
			// frame in case the broadcast path didn't emit one.
			void llmService.chatCompletion(fullRequest, toolExecutor).catch((err) => {
				writeEvent({
					requestId: fullRequest.requestId,
					type: "error",
					error: err instanceof Error ? err.message : String(err),
				});
				cleanup();
			});
		} catch (err) {
			writeEvent({
				requestId: fullRequest.requestId,
				type: "error",
				error: err instanceof Error ? err.message : String(err),
			});
			cleanup();
		}
	}

	// =================== Stop Stream ===================

	@request("post", "/v1/llm/stop")
	@summary("停止指定 requestId 的流")
	@tag
	@body({
		requestId: { type: "string", required: true, description: "要停止的请求 ID" },
	})
	async stopStream(ctx: Koa.Context) {
		try {
			const { requestId } = (ctx.request.body ?? {}) as { requestId?: string };
			if (!requestId) {
				ctx.body = createResponse(ctx, 400, "requestId is required");
				return;
			}
			const stopped = llmService.stopStream(requestId);
			ctx.body = createResponse(ctx, 200, "Success", { stopped });
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to stop stream",
			);
		}
	}

	// =================== Tool Approval ===================

	@request("post", "/v1/llm/tool-approval")
	@summary("工具调用授权响应")
	@description(
		"当流式响应推送 tool_approval_request 事件时，用本接口告诉服务端是否放行工具调用。",
	)
	@tag
	@body({
		toolCallId: { type: "string", required: true, description: "工具调用 ID" },
		approved: { type: "boolean", required: true, description: "是否允许" },
	})
	async toolApproval(ctx: Koa.Context) {
		try {
			const { toolCallId, approved } = (ctx.request.body ?? {}) as {
				toolCallId?: string;
				approved?: boolean;
			};
			if (!toolCallId) {
				ctx.body = createResponse(ctx, 400, "toolCallId is required");
				return;
			}
			llmService.resolveToolApproval(toolCallId, !!approved);
			ctx.body = createResponse(ctx, 200, "Success");
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error
					? error.message
					: "Failed to resolve tool approval",
			);
		}
	}
}
