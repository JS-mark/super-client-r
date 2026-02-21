import type { ModelProviderPreset } from "../../types/models";

export interface PresetProviderInfo {
	id: ModelProviderPreset;
	name: string;
	nameZh: string;
	defaultBaseUrl: string;
	requiresApiKey: boolean;
	helpUrl?: string;
}

export const PRESET_PROVIDERS: PresetProviderInfo[] = [
	{
		id: "dashscope",
		name: "Alibaba Cloud Bailian",
		nameZh: "阿里云百炼",
		defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		requiresApiKey: true,
		helpUrl: "https://help.aliyun.com/zh/model-studio/getting-started/",
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		nameZh: "DeepSeek",
		defaultBaseUrl: "https://api.deepseek.com/v1",
		requiresApiKey: true,
		helpUrl: "https://platform.deepseek.com/",
	},
	{
		id: "openai",
		name: "OpenAI",
		nameZh: "OpenAI",
		defaultBaseUrl: "https://api.openai.com/v1",
		requiresApiKey: true,
		helpUrl: "https://platform.openai.com/api-keys",
	},
	{
		id: "anthropic",
		name: "Anthropic",
		nameZh: "Anthropic",
		defaultBaseUrl: "https://api.anthropic.com/v1",
		requiresApiKey: true,
		helpUrl: "https://console.anthropic.com/",
	},
	{
		id: "gemini",
		name: "Google Gemini",
		nameZh: "Google Gemini",
		defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		requiresApiKey: true,
		helpUrl: "https://aistudio.google.com/apikey",
	},
	{
		id: "cherryin",
		name: "CherryIN",
		nameZh: "CherryIN",
		defaultBaseUrl: "https://cherry.ai/v1",
		requiresApiKey: true,
		helpUrl: "https://cherry.ai/",
	},
	{
		id: "siliconflow",
		name: "SiliconFlow",
		nameZh: "硅基流动",
		defaultBaseUrl: "https://api.siliconflow.cn/v1",
		requiresApiKey: true,
		helpUrl: "https://cloud.siliconflow.cn/",
	},
	{
		id: "aihubmix",
		name: "AihubMix",
		nameZh: "AihubMix",
		defaultBaseUrl: "https://aihubmix.com/v1",
		requiresApiKey: true,
		helpUrl: "https://aihubmix.com/",
	},
	{
		id: "ocoolai",
		name: "ocoolAI",
		nameZh: "ocoolAI",
		defaultBaseUrl: "https://one.ooo.cool/v1",
		requiresApiKey: true,
		helpUrl: "https://one.ooo.cool/",
	},
	{
		id: "zhipu-ai",
		name: "Zhipu AI",
		nameZh: "智谱",
		defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
		requiresApiKey: true,
		helpUrl: "https://open.bigmodel.cn/",
	},
	{
		id: "302ai",
		name: "302.AI",
		nameZh: "302.AI",
		defaultBaseUrl: "https://api.302.ai/v1",
		requiresApiKey: true,
		helpUrl: "https://302.ai/",
	},
	{
		id: "moonshot",
		name: "Moonshot",
		nameZh: "月之暗面",
		defaultBaseUrl: "https://api.moonshot.cn/v1",
		requiresApiKey: true,
		helpUrl: "https://platform.moonshot.cn/",
	},
	{
		id: "baichuan",
		name: "Baichuan",
		nameZh: "百川",
		defaultBaseUrl: "https://api.baichuan-ai.com/v1",
		requiresApiKey: true,
		helpUrl: "https://platform.baichuan-ai.com/",
	},
	{
		id: "volcengine",
		name: "Volcengine",
		nameZh: "火山引擎",
		defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
		requiresApiKey: true,
		helpUrl: "https://console.volcengine.com/ark",
	},
	{
		id: "minimax",
		name: "MiniMax",
		nameZh: "MiniMax",
		defaultBaseUrl: "https://api.minimax.chat/v1",
		requiresApiKey: true,
		helpUrl: "https://platform.minimaxi.com/",
	},
	{
		id: "hunyuan",
		name: "Tencent Hunyuan",
		nameZh: "腾讯混元",
		defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
		requiresApiKey: true,
		helpUrl: "https://cloud.tencent.com/product/hunyuan",
	},
	{
		id: "grok",
		name: "Grok",
		nameZh: "Grok",
		defaultBaseUrl: "https://api.x.ai/v1",
		requiresApiKey: true,
		helpUrl: "https://console.x.ai/",
	},
	{
		id: "github-models",
		name: "GitHub Models",
		nameZh: "GitHub Models",
		defaultBaseUrl: "https://models.inference.ai.azure.com",
		requiresApiKey: true,
		helpUrl: "https://github.com/marketplace/models",
	},
	{
		id: "huggingface",
		name: "Hugging Face",
		nameZh: "Hugging Face",
		defaultBaseUrl: "https://api-inference.huggingface.co/v1",
		requiresApiKey: true,
		helpUrl: "https://huggingface.co/settings/tokens",
	},
	{
		id: "openrouter",
		name: "OpenRouter",
		nameZh: "OpenRouter",
		defaultBaseUrl: "https://openrouter.ai/api/v1",
		requiresApiKey: true,
		helpUrl: "https://openrouter.ai/keys",
	},
	{
		id: "ollama",
		name: "Ollama",
		nameZh: "Ollama",
		defaultBaseUrl: "http://localhost:11434/v1",
		requiresApiKey: false,
		helpUrl: "https://ollama.com/",
	},
	{
		id: "lmstudio",
		name: "LM Studio",
		nameZh: "LM Studio",
		defaultBaseUrl: "http://localhost:1234/v1",
		requiresApiKey: false,
		helpUrl: "https://lmstudio.ai/",
	},
	{
		id: "newapi",
		name: "NewAPI",
		nameZh: "NewAPI",
		defaultBaseUrl: "https://api.newapi.com/v1",
		requiresApiKey: true,
	},
	{
		id: "custom",
		name: "Custom",
		nameZh: "自定义",
		defaultBaseUrl: "",
		requiresApiKey: false,
	},
];

export function getPresetProvider(
	id: ModelProviderPreset,
): PresetProviderInfo | undefined {
	return PRESET_PROVIDERS.find((p) => p.id === id);
}
