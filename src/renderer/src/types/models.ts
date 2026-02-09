export interface ModelConfig {
	apiKey?: string;
	baseUrl?: string;
	parameters?: Record<string, any>;
	maxTokens?: number;
}

export interface ModelInfo {
	id: string;
	name: string;
	provider: "openai" | "anthropic" | "gemini" | "custom";
	capabilities: string[];
	enabled: boolean;
	config: ModelConfig;
}
