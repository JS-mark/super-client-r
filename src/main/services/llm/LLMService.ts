import { BrowserWindow } from "electron";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLM_CHANNELS } from "../../ipc/channels";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
	ModelProviderPreset,
	OpenAIToolCall,
	ProviderModel,
	TestConnectionResponse,
} from "../../ipc/types";
import { normalizeModels } from "./modelNormalizer";

const MAX_TOOL_ROUNDS = 10;

export type ToolExecutor = (
	name: string,
	args: Record<string, unknown>,
) => Promise<unknown>;

export class LLMService {
	private activeStreams = new Map<string, AbortController>();

	async testConnection(
		baseUrl: string,
		apiKey: string,
	): Promise<TestConnectionResponse> {
		const start = Date.now();
		try {
			const client = new OpenAI({
				baseURL: baseUrl,
				apiKey: apiKey || "sk-placeholder",
			});

			await client.models.list();
			const latencyMs = Date.now() - start;
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
		const client = new OpenAI({
			baseURL: baseUrl,
			apiKey: apiKey || "sk-placeholder",
		});

		const response = await client.models.list();
		const rawModels: { id: string; name: string }[] = [];
		for await (const model of response) {
			rawModels.push({ id: model.id, name: model.id });
		}
		rawModels.sort((a, b) => a.id.localeCompare(b.id));
		return normalizeModels(rawModels, preset);
	}

	async chatCompletion(
		request: ChatCompletionRequest,
		toolExecutor?: ToolExecutor,
	): Promise<void> {
		const controller = new AbortController();
		this.activeStreams.set(request.requestId, controller);

		const client = new OpenAI({
			baseURL: request.baseUrl,
			apiKey: request.apiKey || "sk-placeholder",
		});

		const hasTools = request.tools && request.tools.length > 0 && toolExecutor;
		const conversationMessages: ChatCompletionMessageParam[] =
			request.messages as ChatCompletionMessageParam[];

		try {
			const startTime = Date.now();
			let firstTokenTime: number | undefined;
			let totalUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

			for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
				if (controller.signal.aborted) break;

				const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
					model: request.model,
					messages: conversationMessages,
					max_tokens: request.maxTokens ?? 4096,
					temperature: request.temperature ?? 0.7,
					stream: true,
					stream_options: { include_usage: true },
				};

				if (hasTools) {
					createParams.tools = request.tools as OpenAI.Chat.Completions.ChatCompletionTool[];
				}

				const stream = await client.chat.completions.create(
					createParams,
					{ signal: controller.signal },
				);

				let accumulatedContent = "";
				const accumulatedToolCalls: Record<number, { id: string; type: "function"; function: { name: string; arguments: string } }> = {};
				let finishReason: string | null = null;

				for await (const chunk of stream) {
					if (controller.signal.aborted) break;

					const choice = chunk.choices[0];
					if (!choice) {
						// Usage-only final chunk
						if (chunk.usage) {
							const roundUsage = {
								inputTokens: chunk.usage.prompt_tokens ?? 0,
								outputTokens: chunk.usage.completion_tokens ?? 0,
								totalTokens: chunk.usage.total_tokens ?? 0,
							};
							if (totalUsage) {
								totalUsage.inputTokens += roundUsage.inputTokens;
								totalUsage.outputTokens += roundUsage.outputTokens;
								totalUsage.totalTokens += roundUsage.totalTokens;
							} else {
								totalUsage = roundUsage;
							}
						}
						continue;
					}

					// Accumulate text content
					const delta = choice.delta;
					if (delta?.content) {
						if (firstTokenTime === undefined) {
							firstTokenTime = Date.now();
						}
						accumulatedContent += delta.content;
						this.broadcast({
							requestId: request.requestId,
							type: "chunk",
							content: delta.content,
						});
					}

					// Accumulate tool calls from stream deltas
					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							const idx = tc.index;
							if (!accumulatedToolCalls[idx]) {
								accumulatedToolCalls[idx] = {
									id: tc.id || "",
									type: "function",
									function: { name: "", arguments: "" },
								};
							}
							if (tc.id) accumulatedToolCalls[idx].id = tc.id;
							if (tc.function?.name) accumulatedToolCalls[idx].function.name += tc.function.name;
							if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
						}
					}

					if (choice.finish_reason) {
						finishReason = choice.finish_reason;
					}

					// Capture usage from final chunk
					if (chunk.usage) {
						const roundUsage = {
							inputTokens: chunk.usage.prompt_tokens ?? 0,
							outputTokens: chunk.usage.completion_tokens ?? 0,
							totalTokens: chunk.usage.total_tokens ?? 0,
						};
						if (totalUsage) {
							totalUsage.inputTokens += roundUsage.inputTokens;
							totalUsage.outputTokens += roundUsage.outputTokens;
							totalUsage.totalTokens += roundUsage.totalTokens;
						} else {
							totalUsage = roundUsage;
						}
					}
				}

				if (controller.signal.aborted) break;

				// Check if model wants to call tools
				const toolCallsList = Object.values(accumulatedToolCalls);
				if (finishReason === "tool_calls" && toolCallsList.length > 0 && toolExecutor) {
					// Append assistant message with tool_calls to conversation
					const assistantToolCalls: OpenAIToolCall[] = toolCallsList.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: { name: tc.function.name, arguments: tc.function.arguments },
					}));

					conversationMessages.push({
						role: "assistant",
						content: accumulatedContent || null,
						tool_calls: assistantToolCalls,
					} as ChatCompletionMessageParam);

					// Execute each tool call sequentially
					for (const tc of assistantToolCalls) {
						if (controller.signal.aborted) break;

						// Broadcast tool_call event
						this.broadcast({
							requestId: request.requestId,
							type: "tool_call",
							toolCall: {
								id: tc.id,
								name: tc.function.name,
								arguments: tc.function.arguments,
							},
						});

						// Execute the tool
						const toolStart = Date.now();
						let toolResult: unknown;
						let isError = false;
						try {
							const parsedArgs = JSON.parse(tc.function.arguments || "{}");
							toolResult = await toolExecutor(tc.function.name, parsedArgs);
						} catch (err) {
							isError = true;
							toolResult = err instanceof Error ? err.message : String(err);
						}
						const toolDuration = Date.now() - toolStart;

						// Broadcast tool_result event
						this.broadcast({
							requestId: request.requestId,
							type: "tool_result",
							toolResult: {
								toolCallId: tc.id,
								name: tc.function.name,
								result: toolResult,
								isError,
								duration: toolDuration,
							},
						});

						// Append tool result message to conversation
						conversationMessages.push({
							role: "tool",
							tool_call_id: tc.id,
							content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
						} as ChatCompletionMessageParam);
					}

					// Continue loop to let the model process tool results
					continue;
				}

				// No tool calls (or finish_reason === "stop") — we're done
				if (!controller.signal.aborted) {
					const totalMs = Date.now() - startTime;
					this.broadcast({
						requestId: request.requestId,
						type: "done",
						usage: totalUsage,
						timing: {
							firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
							totalMs,
						},
					});
				}
				break;
			}
		} catch (error: unknown) {
			if (controller.signal.aborted) return;
			const message =
				error instanceof Error ? error.message : "Stream failed";
			this.broadcast({
				requestId: request.requestId,
				type: "error",
				error: message,
			});
		} finally {
			this.activeStreams.delete(request.requestId);
		}
	}

	stopStream(requestId: string): boolean {
		const controller = this.activeStreams.get(requestId);
		if (controller) {
			controller.abort();
			this.activeStreams.delete(requestId);
			return true;
		}
		return false;
	}

	private broadcast(event: ChatStreamEvent): void {
		BrowserWindow.getAllWindows().forEach((win) => {
			if (!win.isDestroyed()) {
				win.webContents.send(LLM_CHANNELS.STREAM_EVENT, event);
			}
		});
	}
}

export const llmService = new LLMService();
