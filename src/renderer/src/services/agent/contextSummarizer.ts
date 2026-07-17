import { sseStream } from "../localApiClient";

export interface ContextSummarizerModelInput {
	provider?: {
		baseUrl?: string;
		apiKey?: string;
		preset?: string;
		apiFormat?: "anthropic-messages" | "chat-completions" | "responses";
	};
	model?: {
		id?: string;
	};
	conversationId: string;
	requestId: string;
}

export interface ContextSummarizeInput {
	text: string;
	originalCount: number;
	strategy: "compact" | "summarized";
}

type LlmSseEvent =
	| { type: "chunk"; content?: string }
	| { type: "done" }
	| { type: "error"; error?: string; message?: string }
	| Record<string, unknown>;

const SUMMARY_SYSTEM_PROMPT = [
	"You are a conversation summarizer.",
	"Summarize the provided conversation history concisely.",
	"Preserve key facts, decisions, code snippets, file names, constraints, and unresolved next steps needed to continue the conversation.",
	"Write in the same language as the conversation.",
	"Keep the summary under 2000 tokens.",
].join(" ");

export function createContextSummarizer(
	input: ContextSummarizerModelInput,
): ((summaryInput: ContextSummarizeInput) => Promise<string>) | undefined {
	const baseUrl = input.provider?.baseUrl?.trim();
	const model = input.model?.id?.trim();
	if (!baseUrl || !model) return undefined;

	return async (summaryInput) => {
		const chunks: string[] = [];
		const controller = new AbortController();
		try {
			for await (const event of sseStream<LlmSseEvent>(
				"/v1/llm/chat/completions",
				{
					requestId: `${input.requestId}_context_summary`,
					conversationId: input.conversationId,
					baseUrl,
					apiKey: input.provider?.apiKey ?? "",
					model,
					providerPreset: input.provider?.preset,
					apiFormat: input.provider?.apiFormat,
					maxTokens: 2000,
					temperature: 0.2,
					toolPermission: { mode: "none" },
					messages: [
						{ role: "system", content: SUMMARY_SYSTEM_PROMPT },
						{
							role: "user",
							content: [
								`Strategy: ${summaryInput.strategy}`,
								`Original message count: ${summaryInput.originalCount}`,
								"",
								summaryInput.text,
							].join("\n"),
						},
					],
				},
				controller.signal,
			)) {
				if (event.type === "chunk" && typeof event.content === "string") {
					chunks.push(event.content);
				}
				if (event.type === "error") {
					throw new Error(
						typeof event.error === "string"
							? event.error
							: typeof event.message === "string"
								? event.message
								: "Context summarization failed",
					);
				}
				if (event.type === "done") break;
			}
		} finally {
			controller.abort();
		}
		const summary = chunks.join("").trim();
		if (!summary) throw new Error("Context summarization returned empty text");
		return summary;
	};
}
