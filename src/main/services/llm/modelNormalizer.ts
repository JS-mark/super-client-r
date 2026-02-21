import type {
	ModelCapability,
	ModelCategory,
	ModelPricing,
	ModelProviderPreset,
	ProviderModel,
} from "../../ipc/types";

interface KnownModelInfo {
	capabilities: ModelCapability[];
	category: ModelCategory;
	group?: string;
	contextWindow?: number;
	maxTokens?: number;
	pricing?: ModelPricing;
	supportsStreaming?: boolean;
}

/**
 * Static database of well-known models with their capabilities and metadata.
 * Keys are matched as prefixes against model IDs (longest match wins).
 */
const KNOWN_MODELS: Record<string, KnownModelInfo> = {
	// ========== OpenAI ==========
	"gpt-4o": {
		capabilities: ["vision", "tool_use", "web_search"],
		category: "chat",
		group: "GPT-4o",
		contextWindow: 128000,
		maxTokens: 16384,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 2.5,
			outputPricePerMillion: 10,
		},
	},
	"gpt-4o-mini": {
		capabilities: ["vision", "tool_use", "web_search"],
		category: "chat",
		group: "GPT-4o",
		contextWindow: 128000,
		maxTokens: 16384,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.15,
			outputPricePerMillion: 0.6,
		},
	},
	"gpt-4-turbo": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "GPT-4",
		contextWindow: 128000,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 10,
			outputPricePerMillion: 30,
		},
	},
	"gpt-4": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "GPT-4",
		contextWindow: 8192,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 30,
			outputPricePerMillion: 60,
		},
	},
	"gpt-3.5-turbo": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "GPT-3.5",
		contextWindow: 16385,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.5,
			outputPricePerMillion: 1.5,
		},
	},
	"gpt-5": {
		capabilities: ["vision", "tool_use", "reasoning", "web_search"],
		category: "chat",
		group: "GPT-5",
		contextWindow: 256000,
		maxTokens: 32768,
	},
	o1: {
		capabilities: ["vision", "reasoning", "tool_use"],
		category: "chat",
		group: "o-Series",
		contextWindow: 200000,
		maxTokens: 100000,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 15,
			outputPricePerMillion: 60,
		},
	},
	"o1-mini": {
		capabilities: ["reasoning"],
		category: "chat",
		group: "o-Series",
		contextWindow: 128000,
		maxTokens: 65536,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 3,
			outputPricePerMillion: 12,
		},
	},
	"o1-pro": {
		capabilities: ["vision", "reasoning", "tool_use"],
		category: "chat",
		group: "o-Series",
		contextWindow: 200000,
		maxTokens: 100000,
	},
	o3: {
		capabilities: ["vision", "reasoning", "tool_use"],
		category: "chat",
		group: "o-Series",
		contextWindow: 200000,
		maxTokens: 100000,
	},
	"o3-mini": {
		capabilities: ["reasoning", "tool_use"],
		category: "chat",
		group: "o-Series",
		contextWindow: 200000,
		maxTokens: 100000,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 1.1,
			outputPricePerMillion: 4.4,
		},
	},
	"o4-mini": {
		capabilities: ["vision", "reasoning", "tool_use"],
		category: "chat",
		group: "o-Series",
		contextWindow: 200000,
		maxTokens: 100000,
	},

	// ========== Anthropic ==========
	"claude-sonnet-4": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 4",
		contextWindow: 200000,
		maxTokens: 16000,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 3,
			outputPricePerMillion: 15,
		},
	},
	"claude-opus-4": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 4",
		contextWindow: 200000,
		maxTokens: 32000,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 15,
			outputPricePerMillion: 75,
		},
	},
	"claude-3-7-sonnet": {
		capabilities: ["vision", "tool_use", "reasoning"],
		category: "chat",
		group: "Claude 3.7",
		contextWindow: 200000,
		maxTokens: 16000,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 3,
			outputPricePerMillion: 15,
		},
	},
	"claude-3-5-sonnet": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 3.5",
		contextWindow: 200000,
		maxTokens: 8192,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 3,
			outputPricePerMillion: 15,
		},
	},
	"claude-3-5-haiku": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 3.5",
		contextWindow: 200000,
		maxTokens: 8192,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.8,
			outputPricePerMillion: 4,
		},
	},
	"claude-3-opus": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 3",
		contextWindow: 200000,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 15,
			outputPricePerMillion: 75,
		},
	},
	"claude-3-sonnet": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 3",
		contextWindow: 200000,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 3,
			outputPricePerMillion: 15,
		},
	},
	"claude-3-haiku": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Claude 3",
		contextWindow: 200000,
		maxTokens: 4096,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.25,
			outputPricePerMillion: 1.25,
		},
	},

	// ========== Google ==========
	"gemini-2.5-pro": {
		capabilities: ["vision", "tool_use", "reasoning", "web_search"],
		category: "chat",
		group: "Gemini 2.5",
		contextWindow: 1000000,
		maxTokens: 65536,
	},
	"gemini-2.5-flash": {
		capabilities: ["vision", "tool_use", "reasoning", "web_search"],
		category: "chat",
		group: "Gemini 2.5",
		contextWindow: 1000000,
		maxTokens: 65536,
	},
	"gemini-2.0-flash": {
		capabilities: ["vision", "tool_use", "web_search"],
		category: "chat",
		group: "Gemini 2.0",
		contextWindow: 1000000,
		maxTokens: 8192,
	},
	"gemini-1.5-pro": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Gemini 1.5",
		contextWindow: 2000000,
		maxTokens: 8192,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 1.25,
			outputPricePerMillion: 5,
		},
	},
	"gemini-1.5-flash": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Gemini 1.5",
		contextWindow: 1000000,
		maxTokens: 8192,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.075,
			outputPricePerMillion: 0.3,
		},
	},

	// ========== DeepSeek ==========
	"deepseek-chat": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "DeepSeek",
		contextWindow: 64000,
		maxTokens: 8192,
		pricing: {
			currency: "CNY",
			inputPricePerMillion: 1,
			outputPricePerMillion: 2,
		},
	},
	"deepseek-reasoner": {
		capabilities: ["reasoning"],
		category: "chat",
		group: "DeepSeek",
		contextWindow: 64000,
		maxTokens: 8192,
		pricing: {
			currency: "CNY",
			inputPricePerMillion: 4,
			outputPricePerMillion: 16,
		},
	},
	"deepseek-r1": {
		capabilities: ["reasoning"],
		category: "chat",
		group: "DeepSeek",
		contextWindow: 64000,
		maxTokens: 8192,
	},
	"deepseek-v3": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "DeepSeek",
		contextWindow: 64000,
		maxTokens: 8192,
	},

	// ========== Qwen (DashScope) ==========
	"qwen-max": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "Qwen",
		contextWindow: 32000,
		maxTokens: 8192,
		pricing: {
			currency: "CNY",
			inputPricePerMillion: 20,
			outputPricePerMillion: 60,
		},
	},
	"qwen-plus": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "Qwen",
		contextWindow: 131072,
		maxTokens: 8192,
		pricing: {
			currency: "CNY",
			inputPricePerMillion: 0.8,
			outputPricePerMillion: 2,
		},
	},
	"qwen-turbo": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "Qwen",
		contextWindow: 131072,
		maxTokens: 8192,
		pricing: {
			currency: "CNY",
			inputPricePerMillion: 0.3,
			outputPricePerMillion: 0.6,
		},
	},
	"qwen-vl-max": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Qwen VL",
		contextWindow: 32000,
		maxTokens: 8192,
	},
	"qwen-vl-plus": {
		capabilities: ["vision"],
		category: "chat",
		group: "Qwen VL",
		contextWindow: 32000,
		maxTokens: 8192,
	},
	qwq: {
		capabilities: ["reasoning"],
		category: "chat",
		group: "QwQ",
		contextWindow: 131072,
		maxTokens: 8192,
	},

	// ========== Moonshot ==========
	"moonshot-v1": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "Moonshot",
		contextWindow: 128000,
		maxTokens: 8192,
	},

	// ========== GLM (Zhipu AI) ==========
	"glm-4": {
		capabilities: ["tool_use"],
		category: "chat",
		group: "GLM",
		contextWindow: 128000,
		maxTokens: 4096,
	},
	"glm-4v": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "GLM",
		contextWindow: 128000,
		maxTokens: 4096,
	},

	// ========== Grok ==========
	"grok-3": {
		capabilities: ["vision", "tool_use", "reasoning"],
		category: "chat",
		group: "Grok",
		contextWindow: 131072,
		maxTokens: 16384,
	},
	"grok-2": {
		capabilities: ["vision", "tool_use"],
		category: "chat",
		group: "Grok",
		contextWindow: 131072,
		maxTokens: 8192,
	},

	// ========== Embeddings ==========
	"text-embedding-3-large": {
		capabilities: ["embedding"],
		category: "embedding",
		group: "Embeddings",
		supportsStreaming: false,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.13,
			outputPricePerMillion: 0,
		},
	},
	"text-embedding-3-small": {
		capabilities: ["embedding"],
		category: "embedding",
		group: "Embeddings",
		supportsStreaming: false,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.02,
			outputPricePerMillion: 0,
		},
	},
	"text-embedding-ada-002": {
		capabilities: ["embedding"],
		category: "embedding",
		group: "Embeddings",
		supportsStreaming: false,
		pricing: {
			currency: "USD",
			inputPricePerMillion: 0.1,
			outputPricePerMillion: 0,
		},
	},

	// ========== Image Generation ==========
	"dall-e-3": {
		capabilities: [],
		category: "image_generation",
		group: "Image Generation",
		supportsStreaming: false,
	},
	"dall-e-2": {
		capabilities: [],
		category: "image_generation",
		group: "Image Generation",
		supportsStreaming: false,
	},

	// ========== Audio ==========
	"whisper-1": {
		capabilities: [],
		category: "audio",
		group: "Audio",
		supportsStreaming: false,
	},
	"tts-1": {
		capabilities: [],
		category: "audio",
		group: "Audio",
		supportsStreaming: false,
	},
	"tts-1-hd": {
		capabilities: [],
		category: "audio",
		group: "Audio",
		supportsStreaming: false,
	},
};

/**
 * Infer model capabilities heuristically from model ID
 */
function inferCapabilities(modelId: string): ModelCapability[] {
	const id = modelId.toLowerCase();
	const caps: ModelCapability[] = [];

	// Vision
	if (
		id.includes("vision") ||
		id.includes("-vl") ||
		id.includes("gpt-4o") ||
		id.includes("gpt-5") ||
		id.includes("claude-3") ||
		id.includes("claude-4") ||
		id.includes("claude-sonnet-4") ||
		id.includes("claude-opus-4") ||
		id.includes("gemini") ||
		id.includes("grok")
	) {
		caps.push("vision");
	}

	// Reasoning
	if (
		id.startsWith("o1") ||
		id.startsWith("o3") ||
		id.startsWith("o4") ||
		id.includes("deepseek-r") ||
		id.includes("deepseek-reasoner") ||
		id.startsWith("qwq") ||
		id.includes("reasoning")
	) {
		caps.push("reasoning");
	}

	// Tool use
	if (
		id.includes("gpt-") ||
		id.includes("claude-") ||
		id.includes("gemini-") ||
		id.includes("glm-") ||
		id.includes("qwen-") ||
		id.includes("moonshot") ||
		id.includes("grok") ||
		id.includes("deepseek-chat")
	) {
		if (
			!id.includes("embedding") &&
			!id.includes("embed") &&
			!id.includes("dall-e") &&
			!id.includes("tts") &&
			!id.includes("whisper")
		) {
			caps.push("tool_use");
		}
	}

	// Embedding
	if (id.includes("embedding") || id.includes("embed")) {
		caps.push("embedding");
	}

	// Reranking
	if (id.includes("rerank")) {
		caps.push("reranking");
	}

	return [...new Set(caps)];
}

/**
 * Infer model category from model ID
 */
function inferCategory(modelId: string): ModelCategory {
	const id = modelId.toLowerCase();

	if (id.includes("embedding") || id.includes("embed")) return "embedding";
	if (id.includes("rerank")) return "reranking";
	if (
		id.includes("dall-e") ||
		id.includes("stable-diffusion") ||
		id.includes("midjourney")
	)
		return "image_generation";
	if (id.includes("whisper") || id.includes("tts")) return "audio";
	if (
		id.includes("code") ||
		id.includes("codestral") ||
		id.includes("starcoder")
	)
		return "code";

	return "chat";
}

/**
 * Infer model group from ID when no known model match
 */
function inferGroup(modelId: string): string | undefined {
	const id = modelId.toLowerCase();

	if (id.startsWith("gpt-5")) return "GPT-5";
	if (id.startsWith("gpt-4o")) return "GPT-4o";
	if (id.startsWith("gpt-4")) return "GPT-4";
	if (id.startsWith("gpt-3.5")) return "GPT-3.5";
	if (id.startsWith("o1") || id.startsWith("o3") || id.startsWith("o4"))
		return "o-Series";
	if (id.startsWith("claude-opus-4") || id.startsWith("claude-sonnet-4"))
		return "Claude 4";
	if (id.startsWith("claude-3-7")) return "Claude 3.7";
	if (id.startsWith("claude-3-5")) return "Claude 3.5";
	if (id.startsWith("claude-3")) return "Claude 3";
	if (id.startsWith("gemini-2.5")) return "Gemini 2.5";
	if (id.startsWith("gemini-2")) return "Gemini 2.0";
	if (id.startsWith("gemini-1.5")) return "Gemini 1.5";
	if (id.startsWith("deepseek")) return "DeepSeek";
	if (id.startsWith("qwen") || id.startsWith("qwq")) return "Qwen";
	if (id.startsWith("glm")) return "GLM";
	if (id.startsWith("moonshot")) return "Moonshot";
	if (id.startsWith("grok")) return "Grok";
	if (id.startsWith("yi-")) return "Yi";
	if (id.startsWith("mistral") || id.startsWith("mixtral")) return "Mistral";
	if (id.startsWith("llama")) return "Llama";
	if (id.startsWith("phi-")) return "Phi";
	if (id.includes("embedding") || id.includes("embed")) return "Embeddings";
	if (id.includes("dall-e")) return "Image Generation";
	if (id.includes("tts") || id.includes("whisper")) return "Audio";

	return undefined;
}

/**
 * Find the best matching known model entry for a model ID.
 * Uses longest-prefix matching.
 */
function findKnownModel(modelId: string): KnownModelInfo | undefined {
	const id = modelId.toLowerCase();
	let bestMatch: KnownModelInfo | undefined;
	let bestLen = 0;

	for (const [key, info] of Object.entries(KNOWN_MODELS)) {
		if (id.startsWith(key.toLowerCase()) && key.length > bestLen) {
			bestMatch = info;
			bestLen = key.length;
		}
	}

	return bestMatch;
}

/**
 * Normalize a single raw model into a full ProviderModel
 */
function normalizeModel(
	raw: { id: string; name?: string },
	_preset?: ModelProviderPreset,
): ProviderModel {
	const known = findKnownModel(raw.id);

	if (known) {
		return {
			id: raw.id,
			name: raw.name || raw.id,
			group: known.group,
			enabled: true,
			capabilities: known.capabilities,
			category: known.category,
			supportsStreaming: known.supportsStreaming ?? true,
			pricing: known.pricing,
			maxTokens: known.maxTokens,
			contextWindow: known.contextWindow,
		};
	}

	// Fallback to heuristic inference
	return {
		id: raw.id,
		name: raw.name || raw.id,
		group: inferGroup(raw.id),
		enabled: true,
		capabilities: inferCapabilities(raw.id),
		category: inferCategory(raw.id),
		supportsStreaming:
			inferCategory(raw.id) === "chat" || inferCategory(raw.id) === "code",
	};
}

/**
 * Normalize an array of raw models from API into ProviderModel[]
 */
export function normalizeModels(
	rawModels: { id: string; name?: string }[],
	preset?: ModelProviderPreset,
): ProviderModel[] {
	return rawModels.map((raw) => normalizeModel(raw, preset));
}

/**
 * Ensure a ProviderModel from storage has all required fields (backward compatibility).
 * Fills in defaults for models stored before the type expansion.
 */
export function ensureModelDefaults(
	model: Record<string, unknown>,
): ProviderModel {
	const m = model as Partial<ProviderModel> & { id: string; name: string };
	return {
		id: m.id,
		name: m.name || m.id,
		group: m.group,
		enabled: m.enabled ?? true,
		capabilities: m.capabilities ?? inferCapabilities(m.id),
		category: m.category ?? inferCategory(m.id),
		supportsStreaming: m.supportsStreaming ?? true,
		pricing: m.pricing,
		systemPrompt: m.systemPrompt,
		maxTokens: m.maxTokens,
		contextWindow: m.contextWindow,
	};
}
