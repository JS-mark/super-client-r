import { BrowserWindow } from "electron";
import OpenAI from "openai";
import { LLM_CHANNELS } from "../../ipc/channels";
import type {
	ChatCompletionRequest,
	ChatStreamEvent,
	ModelProviderPreset,
	ProviderModel,
	TestConnectionResponse,
} from "../../ipc/types";
import { normalizeModels } from "./modelNormalizer";

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

	async chatCompletion(request: ChatCompletionRequest): Promise<void> {
		const controller = new AbortController();
		this.activeStreams.set(request.requestId, controller);

		const client = new OpenAI({
			baseURL: request.baseUrl,
			apiKey: request.apiKey || "sk-placeholder",
		});

		try {
			const stream = await client.chat.completions.create(
				{
					model: request.model,
					messages: request.messages,
					max_tokens: request.maxTokens ?? 4096,
					temperature: request.temperature ?? 0.7,
					stream: true,
					stream_options: { include_usage: true },
				},
				{ signal: controller.signal },
			);

			let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
			const startTime = Date.now();
			let firstTokenTime: number | undefined;

			for await (const chunk of stream) {
				if (controller.signal.aborted) break;

				const delta = chunk.choices[0]?.delta?.content;
				if (delta) {
					if (firstTokenTime === undefined) {
						firstTokenTime = Date.now();
					}
					this.broadcast({
						requestId: request.requestId,
						type: "chunk",
						content: delta,
					});
				}

				// Capture usage from the final chunk
				if (chunk.usage) {
					usage = {
						inputTokens: chunk.usage.prompt_tokens,
						outputTokens: chunk.usage.completion_tokens,
						totalTokens: chunk.usage.total_tokens,
					};
				}
			}

			if (!controller.signal.aborted) {
				const totalMs = Date.now() - startTime;
				this.broadcast({
					requestId: request.requestId,
					type: "done",
					usage,
					timing: {
						firstTokenMs: firstTokenTime ? firstTokenTime - startTime : undefined,
						totalMs,
					},
				});
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
