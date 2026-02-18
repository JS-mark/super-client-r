import type {
	ActiveModelSelection,
	ChatStreamEvent,
	FetchModelsResponse,
	ModelProvider,
	ModelProviderPreset,
	ProviderModel,
	TestConnectionResponse,
} from "../types/models";

export const modelService = {
	listProviders: (): Promise<{ success: boolean; data?: ModelProvider[]; error?: string }> =>
		window.electron.model.listProviders(),

	getProvider: (id: string) => window.electron.model.getProvider(id),

	saveProvider: (provider: ModelProvider) =>
		window.electron.model.saveProvider(provider),

	deleteProvider: (id: string) => window.electron.model.deleteProvider(id),

	testConnection: (
		baseUrl: string,
		apiKey: string,
	): Promise<{ success: boolean; data?: TestConnectionResponse; error?: string }> =>
		window.electron.model.testConnection(baseUrl, apiKey),

	fetchModels: (
		baseUrl: string,
		apiKey: string,
		preset?: ModelProviderPreset,
	): Promise<{ success: boolean; data?: FetchModelsResponse; error?: string }> =>
		window.electron.model.fetchModels(baseUrl, apiKey, preset),

	updateModelConfig: (
		providerId: string,
		modelId: string,
		config: Partial<ProviderModel>,
	): Promise<{ success: boolean; error?: string }> =>
		window.electron.model.updateModelConfig(providerId, modelId, config),

	getActiveModel: (): Promise<{
		success: boolean;
		data?: ActiveModelSelection | undefined;
		error?: string;
	}> => window.electron.model.getActiveModel(),

	setActiveModel: (selection: ActiveModelSelection | null) =>
		window.electron.model.setActiveModel(selection),

	chatCompletion: (request: {
		requestId: string;
		baseUrl: string;
		apiKey: string;
		model: string;
		messages: { role: "user" | "assistant" | "system"; content: string }[];
		maxTokens?: number;
		temperature?: number;
	}) => window.electron.llm.chatCompletion(request),

	stopStream: (requestId: string) => window.electron.llm.stopStream(requestId),

	onStreamEvent: (callback: (event: ChatStreamEvent) => void): (() => void) =>
		window.electron.llm.onStreamEvent(callback),
};
