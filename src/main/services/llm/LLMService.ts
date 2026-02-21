import Anthropic from "@anthropic-ai/sdk";
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
	ToolPermissionConfig,
} from "../../ipc/types";
import { normalizeModels } from "./modelNormalizer";

const MAX_TOOL_ROUNDS = 10;

export type ToolExecutor = (
	name: string,
	args: Record<string, unknown>,
) => Promise<unknown>;

// ─── Prompt-based Tool Calling ────────────────────────────────────────────────
//
// For models that do NOT support native function calling (e.g. DeepSeek-R1),
// we inject tool descriptions into the system prompt and parse tool invocations
// from the model's text output.
//
// Recognised XML tags (case-insensitive, self-closing or paired):
//   <tool_call>  … </tool_call>
//   <tool_use>   … </tool_use>
//
// The JSON payload inside each tag can be either:
//   { "name": "…", "arguments": { … } }          — canonical
//   { "name": "…", "parameters": { … } }          — alias
//   { "name": "…", "input": { … } }               — Anthropic style
//
// ──────────────────────────────────────────────────────────────────────────────

interface ParsedToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

/**
 * Build a system prompt section describing available tools for prompt-based
 * tool calling.
 */
function buildToolPrompt(tools: ChatCompletionRequest["tools"]): string {
	if (!tools || tools.length === 0) return "";

	const toolDescriptions = tools
		.map((t) => {
			const params = JSON.stringify(t.function.parameters, null, 2);
			return [
				`### ${t.function.name}`,
				t.function.description,
				"Parameters:",
				"```json",
				params,
				"```",
			].join("\n");
		})
		.join("\n\n");

	return `

--- Available Tools ---
You have access to the following tools. To call a tool, output a <tool_call> or <tool_use> XML block containing a JSON object with "name" and "arguments".

You may make multiple tool calls in a single response. Each call MUST be wrapped in its own XML tag.

Format (both are accepted):

<tool_call>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_call>

<tool_use>
{"name": "tool_name", "arguments": {"key": "value"}}
</tool_use>

After you output tool calls the system will execute them and return results in the next message. You can then continue your response.

IMPORTANT:
- You MUST use the XML tag format above. Do NOT merely describe what you would do — actually invoke the tool.
- Always wait for tool results before telling the user the outcome.

${toolDescriptions}`;
}

/**
 * Pattern that matches <tool_call>…</tool_call> or <tool_use>…</tool_use>
 * (case-insensitive).
 */
const TOOL_BLOCK_RE = /<(tool_call|tool_use)>\s*([\s\S]*?)\s*<\/\1>/gi;

/**
 * Try to extract a valid tool call from a raw JSON string found inside
 * a tool XML block. Handles several common payload shapes.
 */
function tryParseToolPayload(raw: string, idx: number): ParsedToolCall | null {
	let obj: Record<string, unknown>;
	try {
		obj = JSON.parse(raw);
	} catch {
		return null;
	}

	const name =
		(typeof obj.name === "string" && obj.name) ||
		(typeof obj.function === "string" && obj.function) ||
		(typeof obj.tool === "string" && obj.tool);

	if (!name) return null;

	const args: Record<string, unknown> =
		(typeof obj.arguments === "object" && obj.arguments !== null
			? (obj.arguments as Record<string, unknown>)
			: undefined) ??
		(typeof obj.parameters === "object" && obj.parameters !== null
			? (obj.parameters as Record<string, unknown>)
			: undefined) ??
		(typeof obj.input === "object" && obj.input !== null
			? (obj.input as Record<string, unknown>)
			: undefined) ??
		{};

	return {
		id: `prompt_tc_${Date.now()}_${idx}`,
		name,
		arguments: args,
	};
}

/**
 * Parse tool invocation blocks from model text output.
 *
 * @returns parsed tool calls and the text with all tool blocks stripped.
 */
function parseToolCallsFromText(text: string): {
	cleanText: string;
	toolCalls: ParsedToolCall[];
} {
	const toolCalls: ParsedToolCall[] = [];
	let match: RegExpExecArray | null;
	let idx = 0;

	// Reset lastIndex because the regex is global+sticky
	TOOL_BLOCK_RE.lastIndex = 0;

	while ((match = TOOL_BLOCK_RE.exec(text)) !== null) {
		const payload = match[2];
		const tc = tryParseToolPayload(payload, idx);
		if (tc) {
			toolCalls.push(tc);
			idx++;
		}
	}

	const cleanText = text.replace(TOOL_BLOCK_RE, "").trim();
	return { cleanText, toolCalls };
}

/**
 * Quick check: does the text contain any tool invocation blocks?
 */
function hasToolBlocks(text: string): boolean {
	return /<(?:tool_call|tool_use)>/i.test(text);
}

export class LLMService {
	private activeStreams = new Map<string, AbortController>();
	// Track providers that don't support stream_options
	private noStreamOptionsProviders = new Set<string>();
	// Pending tool approval requests awaiting user response
	private pendingApprovals = new Map<
		string,
		{ resolve: (approved: boolean) => void }
	>();
	// Chat hook registry (injected from PluginManager)
	private chatHookRegistry: import("../plugin/hooks/ChatHooks").ChatHookRegistry | null =
		null;

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
	): Promise<boolean> {
		if (!permission || permission.mode === "auto") return true;
		if (permission.mode === "none") return false;
		if (
			permission.mode === "approve_except_authorized" &&
			permission.authorizedTools?.includes(toolName)
		) {
			return true;
		}
		// approve_always or approve_except_authorized with unauthorized tool
		this.broadcast({
			requestId,
			type: "tool_approval_request",
			toolApproval: { toolCallId, name: toolName, arguments: toolArgs },
		});
		return new Promise<boolean>((resolve) => {
			this.pendingApprovals.set(toolCallId, { resolve });
		});
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
		if (request.providerPreset === "anthropic") {
			return this.chatCompletionAnthropic(request, toolExecutor);
		}

		const controller = new AbortController();
		this.activeStreams.set(request.requestId, controller);

		const client = new OpenAI({
			baseURL: request.baseUrl,
			apiKey: request.apiKey || "sk-placeholder",
		});

		const isPromptMode = request.toolCallMode === "prompt";
		const hasTools = request.tools && request.tools.length > 0 && toolExecutor;
		const conversationMessages: ChatCompletionMessageParam[] =
			request.messages as ChatCompletionMessageParam[];
		const supportsStreamOptions = !this.noStreamOptionsProviders.has(
			request.baseUrl,
		);

		// Run preSend hooks
		if (this.chatHookRegistry?.hasHooks("preSend")) {
			const hookCtx: import("../plugin/types").PreSendHookContext = {
				messages: conversationMessages.map((m) => {
					const msg = m as unknown as Record<string, unknown>;
					return {
						role: String(msg.role),
						content: String(msg.content ?? ""),
					};
				}),
			};
			await this.chatHookRegistry.runPreSendHooks(hookCtx);
			if (hookCtx.cancelled) {
				this.broadcast({
					requestId: request.requestId,
					type: "done",
				});
				this.activeStreams.delete(request.requestId);
				return;
			}
		}

		// Run systemPrompt hooks
		if (this.chatHookRegistry?.hasHooks("systemPrompt")) {
			const firstMsg = conversationMessages[0];
			if (
				firstMsg &&
				"role" in firstMsg &&
				firstMsg.role === "system" &&
				"content" in firstMsg &&
				typeof firstMsg.content === "string"
			) {
				const hookCtx = { systemPrompt: firstMsg.content };
				await this.chatHookRegistry.runSystemPromptHooks(hookCtx);
				firstMsg.content = hookCtx.systemPrompt;
			}
		}

		// For prompt-based tool calling, inject tool descriptions into the first system message
		if (isPromptMode && hasTools) {
			const toolPrompt = buildToolPrompt(request.tools);
			if (toolPrompt) {
				const first = conversationMessages[0];
				if (
					first &&
					"role" in first &&
					first.role === "system" &&
					"content" in first &&
					typeof first.content === "string"
				) {
					first.content += toolPrompt;
				} else {
					conversationMessages.unshift({
						role: "system",
						content: toolPrompt,
					} as ChatCompletionMessageParam);
				}
			}
		}

		try {
			const startTime = Date.now();
			let firstTokenTime: number | undefined;
			let totalUsage:
				| { inputTokens: number; outputTokens: number; totalTokens: number }
				| undefined;

			for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
				if (controller.signal.aborted) break;

				const createParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming =
					{
						model: request.model,
						messages: conversationMessages,
						max_tokens: request.maxTokens ?? 4096,
						temperature: request.temperature ?? 0.7,
						stream: true,
					};

				if (request.topP != null) {
					createParams.top_p = request.topP;
				}

				// Merge any extra params from custom parameters
				if (request.extraParams) {
					Object.assign(createParams, request.extraParams);
				}

				if (supportsStreamOptions) {
					createParams.stream_options = { include_usage: true };
				}

				// Only pass native tools in function mode (not prompt mode)
				if (hasTools && !isPromptMode) {
					createParams.tools =
						request.tools as OpenAI.Chat.Completions.ChatCompletionTool[];
				}

				let stream: ReturnType<
					typeof client.chat.completions.create
				> extends Promise<infer R>
					? R
					: never;
				try {
					stream = await client.chat.completions.create(createParams, {
						signal: controller.signal,
					});
				} catch (err) {
					// Some providers don't support stream_options; retry without it
					if (
						supportsStreamOptions &&
						err instanceof Error &&
						/invalid|not support|unknown/i.test(err.message)
					) {
						this.noStreamOptionsProviders.add(request.baseUrl);
						delete (createParams as unknown as Record<string, unknown>)
							.stream_options;
						stream = await client.chat.completions.create(createParams, {
							signal: controller.signal,
						});
					} else {
						throw err;
					}
				}

				let accumulatedContent = "";
				const accumulatedToolCalls: Record<
					number,
					{
						id: string;
						type: "function";
						function: { name: string; arguments: string };
					}
				> = {};
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
							if (tc.function?.name)
								accumulatedToolCalls[idx].function.name += tc.function.name;
							if (tc.function?.arguments)
								accumulatedToolCalls[idx].function.arguments +=
									tc.function.arguments;
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
				// Note: some providers (e.g. DeepSeek) return finish_reason="stop"
				// even when tool calls are present, so we check accumulated tool calls
				// regardless of the finish_reason value.
				const toolCallsList = Object.values(accumulatedToolCalls);
				if (toolCallsList.length > 0 && toolExecutor) {
					// Append assistant message with tool_calls to conversation
					const assistantToolCalls: OpenAIToolCall[] = toolCallsList.map(
						(tc) => ({
							id: tc.id,
							type: "function" as const,
							function: {
								name: tc.function.name,
								arguments: tc.function.arguments,
							},
						}),
					);

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

						// Check tool permission before execution
						const approved = await this.checkToolPermission(
							request.requestId,
							request.toolPermission,
							tc.id,
							tc.function.name,
							tc.function.arguments,
						);

						let toolResult: unknown;
						let isError = false;

						if (!approved) {
							isError = true;
							toolResult = "Tool call was rejected by user.";
							this.broadcast({
								requestId: request.requestId,
								type: "tool_rejected",
								toolResult: {
									toolCallId: tc.id,
									name: tc.function.name,
									result: toolResult,
									isError: true,
								},
							});
						} else {
							const toolStart = Date.now();
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
						}

						// Append tool result message to conversation
						conversationMessages.push({
							role: "tool",
							tool_call_id: tc.id,
							content:
								typeof toolResult === "string"
									? toolResult
									: JSON.stringify(toolResult),
						} as ChatCompletionMessageParam);
					}

					// Continue loop to let the model process tool results
					continue;
				}

				// Prompt-based tool call parsing: extract <tool_call>/<tool_use> blocks
				if (isPromptMode && toolExecutor && hasToolBlocks(accumulatedContent)) {
					const { cleanText, toolCalls: parsedToolCalls } =
						parseToolCallsFromText(accumulatedContent);

					if (parsedToolCalls.length > 0) {
						// Add assistant message (with clean text) to conversation
						conversationMessages.push({
							role: "assistant",
							content: accumulatedContent,
						} as ChatCompletionMessageParam);

						const toolResultParts: string[] = [];

						for (const tc of parsedToolCalls) {
							if (controller.signal.aborted) break;

							// Broadcast tool_call event to renderer
							this.broadcast({
								requestId: request.requestId,
								type: "tool_call",
								toolCall: {
									id: tc.id,
									name: tc.name,
									arguments: JSON.stringify(tc.arguments),
								},
							});

							// Check permission
							const approved = await this.checkToolPermission(
								request.requestId,
								request.toolPermission,
								tc.id,
								tc.name,
								JSON.stringify(tc.arguments),
							);

							let toolResult: unknown;
							let isError = false;

							if (!approved) {
								isError = true;
								toolResult = "Tool call was rejected by user.";
								this.broadcast({
									requestId: request.requestId,
									type: "tool_rejected",
									toolResult: {
										toolCallId: tc.id,
										name: tc.name,
										result: toolResult,
										isError: true,
									},
								});
							} else {
								const toolStart = Date.now();
								try {
									toolResult = await toolExecutor(tc.name, tc.arguments);
								} catch (err) {
									isError = true;
									toolResult = err instanceof Error ? err.message : String(err);
								}
								const toolDuration = Date.now() - toolStart;

								this.broadcast({
									requestId: request.requestId,
									type: "tool_result",
									toolResult: {
										toolCallId: tc.id,
										name: tc.name,
										result: toolResult,
										isError,
										duration: toolDuration,
									},
								});
							}

							const resultStr =
								typeof toolResult === "string"
									? toolResult
									: JSON.stringify(toolResult);
							toolResultParts.push(
								`[Tool: ${tc.name}] ${isError ? "Error: " : ""}${resultStr}`,
							);
						}

						// Feed tool results back as a user message
						conversationMessages.push({
							role: "user",
							content: `Tool execution results:\n${toolResultParts.join("\n")}`,
						} as ChatCompletionMessageParam);

						// Continue loop for the model to process results
						continue;
					}
				}

				// No tool calls — we're done
				// Run postResponse hooks
				if (
					accumulatedContent &&
					this.chatHookRegistry?.hasHooks("postResponse")
				) {
					const hookCtx = { response: accumulatedContent };
					await this.chatHookRegistry.runPostResponseHooks(hookCtx);
					// If response was modified, broadcast the delta
					if (hookCtx.response !== accumulatedContent) {
						const delta = hookCtx.response.slice(
							accumulatedContent.length,
						);
						if (delta) {
							this.broadcast({
								requestId: request.requestId,
								type: "chunk",
								content: delta,
							});
						}
					}
				}

				if (!controller.signal.aborted) {
					const totalMs = Date.now() - startTime;
					this.broadcast({
						requestId: request.requestId,
						type: "done",
						usage: totalUsage,
						timing: {
							firstTokenMs: firstTokenTime
								? firstTokenTime - startTime
								: undefined,
							totalMs,
						},
					});
				}
				break;
			}
		} catch (error: unknown) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : "Stream failed";
			this.broadcast({
				requestId: request.requestId,
				type: "error",
				error: message,
			});
		} finally {
			this.activeStreams.delete(request.requestId);
		}
	}

	/**
	 * Anthropic SDK native chat completion with streaming and tool use.
	 */
	private async chatCompletionAnthropic(
		request: ChatCompletionRequest,
		toolExecutor?: ToolExecutor,
	): Promise<void> {
		const controller = new AbortController();
		this.activeStreams.set(request.requestId, controller);

		const client = new Anthropic({
			apiKey: request.apiKey || "",
			baseURL: request.baseUrl,
		});

		const hasTools = request.tools && request.tools.length > 0 && toolExecutor;

		// Convert OpenAI-format messages to Anthropic format
		// Extract system prompt and convert message roles
		let systemPrompt: string | undefined;
		const anthropicMessages: Anthropic.MessageParam[] = [];

		for (const msg of request.messages) {
			if (
				"role" in msg &&
				msg.role === "system" &&
				"content" in msg &&
				typeof msg.content === "string"
			) {
				// Concatenate system messages
				systemPrompt = systemPrompt
					? `${systemPrompt}\n\n${msg.content}`
					: msg.content;
			} else if (
				"role" in msg &&
				(msg.role === "user" || msg.role === "assistant") &&
				"content" in msg &&
				typeof msg.content === "string"
			) {
				anthropicMessages.push({
					role: msg.role,
					content: msg.content,
				});
			}
			// Skip tool/tool_calls messages from history — fresh conversation
		}

		// Convert OpenAI tools format to Anthropic tools format
		const anthropicTools: Anthropic.Tool[] | undefined = hasTools
			? request.tools!.map((t) => ({
					name: t.function.name,
					description: t.function.description,
					input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
				}))
			: undefined;

		try {
			const startTime = Date.now();
			let firstTokenTime: number | undefined;
			let totalUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

			for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
				if (controller.signal.aborted) break;

				const createParams: Anthropic.MessageCreateParamsStreaming = {
					model: request.model,
					max_tokens: request.maxTokens ?? 4096,
					messages: anthropicMessages,
					stream: true,
				};

				if (systemPrompt) {
					createParams.system = systemPrompt;
				}

				if (request.temperature != null) {
					createParams.temperature = request.temperature;
				}

				if (request.topP != null) {
					createParams.top_p = request.topP;
				}

				// Merge any extra params from custom parameters
				if (request.extraParams) {
					Object.assign(createParams, request.extraParams);
				}

				if (anthropicTools && anthropicTools.length > 0) {
					createParams.tools = anthropicTools;
				}

				const stream = client.messages.stream(createParams, {
					signal: controller.signal,
				});

				let accumulatedText = "";
				const toolUseBlocks: Array<{
					id: string;
					name: string;
					input: Record<string, unknown>;
				}> = [];
				let currentToolId = "";
				let currentToolName = "";
				let currentToolInput = "";
				let stopReason: string | null = null;

				for await (const event of stream) {
					if (controller.signal.aborted) break;

					if (event.type === "content_block_start") {
						if (event.content_block.type === "tool_use") {
							currentToolId = event.content_block.id;
							currentToolName = event.content_block.name;
							currentToolInput = "";
						}
					} else if (event.type === "content_block_delta") {
						if (event.delta.type === "text_delta") {
							if (firstTokenTime === undefined) {
								firstTokenTime = Date.now();
							}
							accumulatedText += event.delta.text;
							this.broadcast({
								requestId: request.requestId,
								type: "chunk",
								content: event.delta.text,
							});
						} else if (event.delta.type === "input_json_delta") {
							currentToolInput += event.delta.partial_json;
						}
					} else if (event.type === "content_block_stop") {
						if (currentToolId) {
							let parsedInput: Record<string, unknown> = {};
							try {
								parsedInput = JSON.parse(currentToolInput || "{}");
							} catch {
								/* use empty object */
							}
							toolUseBlocks.push({
								id: currentToolId,
								name: currentToolName,
								input: parsedInput,
							});
							currentToolId = "";
							currentToolName = "";
							currentToolInput = "";
						}
					} else if (event.type === "message_delta") {
						stopReason = event.delta.stop_reason;
						if (event.usage) {
							totalUsage.outputTokens += event.usage.output_tokens;
						}
					} else if (event.type === "message_start" && event.message.usage) {
						totalUsage.inputTokens += event.message.usage.input_tokens;
						totalUsage.outputTokens += event.message.usage.output_tokens;
					}
				}

				totalUsage.totalTokens =
					totalUsage.inputTokens + totalUsage.outputTokens;

				if (controller.signal.aborted) break;

				// Handle tool use
				// Check for accumulated tool blocks regardless of stop_reason
				// for provider compatibility
				if (toolUseBlocks.length > 0 && toolExecutor) {
					// Add assistant message with content to conversation
					const assistantContent: Anthropic.ContentBlockParam[] = [];
					if (accumulatedText) {
						assistantContent.push({ type: "text", text: accumulatedText });
					}
					for (const tb of toolUseBlocks) {
						assistantContent.push({
							type: "tool_use",
							id: tb.id,
							name: tb.name,
							input: tb.input,
						});
					}
					anthropicMessages.push({
						role: "assistant",
						content: assistantContent,
					});

					// Execute each tool call
					const toolResults: Anthropic.ToolResultBlockParam[] = [];
					for (const tb of toolUseBlocks) {
						if (controller.signal.aborted) break;

						// Broadcast tool_call event
						this.broadcast({
							requestId: request.requestId,
							type: "tool_call",
							toolCall: {
								id: tb.id,
								name: tb.name,
								arguments: JSON.stringify(tb.input),
							},
						});

						// Check tool permission before execution
						const approved = await this.checkToolPermission(
							request.requestId,
							request.toolPermission,
							tb.id,
							tb.name,
							JSON.stringify(tb.input),
						);

						let toolResult: unknown;
						let isError = false;

						if (!approved) {
							isError = true;
							toolResult = "Tool call was rejected by user.";
							this.broadcast({
								requestId: request.requestId,
								type: "tool_rejected",
								toolResult: {
									toolCallId: tb.id,
									name: tb.name,
									result: toolResult,
									isError: true,
								},
							});
						} else {
							const toolStart = Date.now();
							try {
								toolResult = await toolExecutor(tb.name, tb.input);
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
									toolCallId: tb.id,
									name: tb.name,
									result: toolResult,
									isError,
									duration: toolDuration,
								},
							});
						}

						toolResults.push({
							type: "tool_result",
							tool_use_id: tb.id,
							content:
								typeof toolResult === "string"
									? toolResult
									: JSON.stringify(toolResult),
							is_error: isError,
						});
					}

					// Add tool results as user message
					anthropicMessages.push({
						role: "user",
						content: toolResults,
					});

					// Continue loop for next round
					continue;
				}

				// No tool calls — done
				if (!controller.signal.aborted) {
					const totalMs = Date.now() - startTime;
					this.broadcast({
						requestId: request.requestId,
						type: "done",
						usage: totalUsage,
						timing: {
							firstTokenMs: firstTokenTime
								? firstTokenTime - startTime
								: undefined,
							totalMs,
						},
					});
				}
				break;
			}
		} catch (error: unknown) {
			if (controller.signal.aborted) return;
			const message =
				error instanceof Error ? error.message : "Anthropic stream failed";
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
