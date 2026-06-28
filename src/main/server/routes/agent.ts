/**
 * Agent SDK API 路由
 *
 * 暴露三个端点把渲染端的 Agent 聊天链路从 IPC 迁到本地 HTTP：
 *   - POST /v1/agent/query     SSE 流式聊天
 *   - POST /v1/agent/interrupt 中断指定请求
 *   - POST /v1/agent/approval  工具调用授权决策
 *
 * 实现策略：复用 `streamingHandlers.ts` (legacy `agent-sdk:create-query` IPC
 * 兜底通道) 走过的同一套适配层 —— `adaptSdkRequestToRuntime` +
 * `adaptRuntimeEventToSdk` —— 直接驱动注册过的 `llm-loop` runtime。这样
 * SSE 帧与 IPC 推送的 `agent-sdk:stream-event` payload 完全等价，渲染端
 * 只需要把订阅源从 IPC 换成 SSE，事件 shape 不变。
 *
 * 注意：`ClaudeCodeAgentRuntime.createQuery` 内部仍会做一次 loopback fetch
 * `/v1/llm/chat/completions`。这是预期的——我们只在 renderer↔main 这一段
 * 把 IPC 换成 HTTP，main 内部的链路完全不动。
 */

import { body, request, summary, tags } from "koa-swagger-decorator";
import type Koa from "koa";
import { getAgentRuntimeRegistry } from "../../services/agent/runtime/AgentRuntimeRegistry";
import {
	adaptRuntimeEventToSdk,
	adaptSdkRequestToRuntime,
	createSdkAdapterState,
} from "../../services/agent/runtime/agentSdkLegacyAdapter";
import { logger } from "../../utils/logger";
import type { AgentSDKQueryRequest } from "../../ipc/types";

const tag = tags(["Agent"]);
const log = logger.withContext("AgentRoute");

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

export class AgentController {
	// =================== Streaming Agent Query (SSE) ===================

	@request("post", "/v1/agent/query")
	@summary("流式 Agent 聊天（SSE，对齐 AgentSDK 事件）")
	@tag
	@body({
		requestId: {
			type: "string",
			required: true,
			description: "前端生成的请求 ID，用于关联事件流",
		},
		request: {
			type: "object",
			required: true,
			description: "AgentSDKQueryRequest payload（prompt / sessionId / model 等）",
		},
	})
	async createQuery(ctx: Koa.Context) {
		const raw = (ctx.request.body ?? {}) as {
			requestId?: string;
			request?: AgentSDKQueryRequest;
		};
		if (!raw.requestId || !raw.request) {
			ctx.body = createResponse(
				ctx,
				400,
				"requestId and request are required",
			);
			return;
		}
		const { requestId, request: sdkRequest } = raw;

		const registry = getAgentRuntimeRegistry();
		const runtime = registry.tryGet("llm-loop");
		if (!runtime) {
			ctx.body = createResponse(
				ctx,
				503,
				"llm-loop runtime not registered",
			);
			return;
		}

		// 切到裸流响应：直接往底层 socket 写 SSE 帧，告诉 Koa 不要写
		// `ctx.body`，与 `/v1/llm/chat/completions` 同款。
		ctx.respond = false;
		const res = ctx.res;
		res.statusCode = 200;
		res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
		res.setHeader("Cache-Control", "no-cache, no-transform");
		res.setHeader("Connection", "keep-alive");
		res.setHeader("X-Accel-Buffering", "no");
		res.flushHeaders?.();
		// 禁用 Nagle：让 res.write() 立即发出 TCP 包，避免小包被合并。
		// 浏览器侧 (Chromium fetch) 在 Nagle + delay-ack 双重作用下会等待
		// 几百毫秒才把数据交给 reader.read()，体现为「不流式」。
		try {
			ctx.req.socket?.setNoDelay(true);
		} catch {
			// socket 可能在某些场景下已经被替换，忽略
		}
		// 发送 2KB padding 注释行：Chromium 的 fetch 在拿到大约 2KB 之前
		// 不会把响应体交给 ReadableStream consumer。SSE 注释（以 `:`
		// 开头）会被 parser 静默忽略，对客户端无副作用。
		res.write(`:${"-".repeat(2048)}\n\n`);

		let cleanedUp = false;
		const cleanup = () => {
			if (cleanedUp) return;
			cleanedUp = true;
			try {
				if (!res.writableEnded) res.end();
			} catch {
				// already closed
			}
		};

		const writeEvent = (event: Record<string, unknown>) => {
			if (cleanedUp) return;
			try {
				const type = typeof event.type === "string" ? event.type : "message";
				res.write(`event: ${type}\n`);
				res.write(`data: ${JSON.stringify(event)}\n\n`);
			} catch (err) {
				log.warn("Failed to write SSE event", {
					requestId,
					err: err instanceof Error ? err.message : String(err),
				});
				cleanup();
			}
		};

		// 客户端断开时：abort runtime + 显式 interrupt。AbortController 关联到
		// 上面 adaptSdkRequestToRuntime 注入的 signal，让 runtime 能感知到。
		const controller = new AbortController();
		ctx.req.on("close", () => {
			if (cleanedUp) return;
			controller.abort();
			runtime.interrupt(requestId).catch((err) => {
				log.warn("interrupt on client close failed", {
					requestId,
					err: err instanceof Error ? err.message : String(err),
				});
			});
			cleanup();
		});

		try {
			const runtimeReq = adaptSdkRequestToRuntime(
				requestId,
				sdkRequest,
				controller.signal,
			);
			const adapterState = createSdkAdapterState();

			for await (const ev of runtime.createQuery(runtimeReq)) {
				if (cleanedUp) break;
				const legacy = adaptRuntimeEventToSdk(ev, adapterState);
				if (!legacy) continue;
				writeEvent(legacy);
				if (legacy.type === "result" || legacy.type === "error") {
					cleanup();
					break;
				}
			}
			// 流自然结束但没有 result/error：补一个空 result 以与 IPC 兜底通道
			// 行为对齐（streamingHandlers 内部的 pump 也会跑完即返回，但
			// runtime 通常已经在 finally 之前发了 result）。
			cleanup();
		} catch (err) {
			log.warn("agent query stream threw", {
				requestId,
				err: err instanceof Error ? err.message : String(err),
			});
			writeEvent({
				requestId,
				type: "error",
				error: err instanceof Error ? err.message : String(err),
			});
			cleanup();
		}
	}

	// =================== Interrupt ===================

	@request("post", "/v1/agent/interrupt")
	@summary("中断 Agent 流")
	@tag
	@body({
		requestId: { type: "string", required: true, description: "要停止的请求 ID" },
	})
	async interrupt(ctx: Koa.Context) {
		try {
			const { requestId } = (ctx.request.body ?? {}) as { requestId?: string };
			if (!requestId) {
				ctx.body = createResponse(ctx, 400, "requestId is required");
				return;
			}
			const runtime = getAgentRuntimeRegistry().tryGet("llm-loop");
			if (runtime) {
				await runtime.interrupt(requestId);
			}
			ctx.body = createResponse(ctx, 200, "Success", { interrupted: true });
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error ? error.message : "Failed to interrupt",
			);
		}
	}

	// =================== Tool Approval ===================

	@request("post", "/v1/agent/approval")
	@summary("Agent 工具调用授权决策")
	@tag
	@body({
		toolUseId: { type: "string", required: true, description: "工具调用 ID" },
		approved: { type: "boolean", required: true, description: "是否允许" },
		scope: {
			type: "string",
			required: false,
			description: "授权范围：once / session / always（默认 once）",
		},
		payload: {
			type: "object",
			required: false,
			description:
				"用户在授权卡片里提供的结构化数据（如 AskUserQuestion 的 answers），会被透传给 LLMService.resolveToolApproval。",
		},
	})
	async approval(ctx: Koa.Context) {
		try {
			const { toolUseId, approved, scope, payload } = (ctx.request.body ??
				{}) as {
				toolUseId?: string;
				approved?: boolean;
				scope?: string;
				payload?: Record<string, unknown>;
			};
			if (!toolUseId) {
				ctx.body = createResponse(ctx, 400, "toolUseId is required");
				return;
			}
			const runtime = getAgentRuntimeRegistry().tryGet("llm-loop");
			if (runtime) {
				await runtime.resolvePermission(toolUseId, {
					approved: !!approved,
					scope:
						(scope as "once" | "session" | "workspace" | "global") ?? "once",
					payload,
				});
			}
			ctx.body = createResponse(ctx, 200, "Success");
		} catch (error) {
			ctx.body = createResponse(
				ctx,
				500,
				error instanceof Error
					? error.message
					: "Failed to resolve agent approval",
			);
		}
	}
}
