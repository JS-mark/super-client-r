/**
 * 渲染进程 Webhook 服务客户端
 */

export interface WebhookConfig {
	id: string;
	name: string;
	type: "dingtalk" | "feishu" | "custom";
	url: string;
	secret?: string;
	headers?: Record<string, string>;
	method?: "GET" | "POST";
	enabled: boolean;
	createdAt: number;
}

export const webhookService = {
	getConfigs: () => window.electron.webhook.getConfigs(),
	saveConfig: (config: {
		id: string;
		name: string;
		type: string;
		url: string;
		secret?: string;
		headers?: Record<string, string>;
		method?: string;
		enabled: boolean;
		createdAt: number;
	}) => window.electron.webhook.saveConfig(config as never),
	deleteConfig: (id: string) => window.electron.webhook.deleteConfig(id),
	test: (configId: string) => window.electron.webhook.test(configId),
};
