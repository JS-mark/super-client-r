import type {
	SearchConfig,
	SearchProviderType,
	SearchConfigsResponse,
	ValidateConfigResponse,
	SearchExecuteRequest,
	SearchExecuteResponse,
	IPCResponse,
} from "../../types/search";

export const searchService = {
	/**
	 * 获取所有搜索配置
	 */
	async getConfigs(): Promise<IPCResponse<SearchConfigsResponse>> {
		return (window as any).electron.search.getConfigs();
	},

	/**
	 * 保存搜索配置
	 */
	async saveConfig(config: SearchConfig): Promise<IPCResponse> {
		return (window as any).electron.search.saveConfig(config);
	},

	/**
	 * 删除搜索配置
	 */
	async deleteConfig(id: string): Promise<IPCResponse> {
		return (window as any).electron.search.deleteConfig(id);
	},

	/**
	 * 设置默认搜索引擎
	 */
	async setDefault(provider: SearchProviderType | null): Promise<IPCResponse> {
		return (window as any).electron.search.setDefault(provider);
	},

	/**
	 * 获取默认搜索引擎
	 */
	async getDefault(): Promise<IPCResponse<SearchProviderType | undefined>> {
		return (window as any).electron.search.getDefault();
	},

	/**
	 * 验证搜索配置
	 */
	async validateConfig(
		config: SearchConfig,
	): Promise<IPCResponse<ValidateConfigResponse>> {
		return (window as any).electron.search.validateConfig(config);
	},

	/**
	 * 执行搜索
	 */
	async execute(
		request: SearchExecuteRequest,
	): Promise<IPCResponse<SearchExecuteResponse>> {
		return (window as any).electron.search.execute(request);
	},
};
