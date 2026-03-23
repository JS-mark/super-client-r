/**
 * 网络服务客户端
 * 代理配置 + 请求日志追踪
 */

import type { ProxyConfig, RequestLogEntry } from "../types/electron";

export const networkService = {
	// ============ 代理配置 ============

	getProxyConfig: () => window.electron.network.getProxyConfig(),

	setProxyConfig: (config: ProxyConfig) =>
		window.electron.network.setProxyConfig(config),

	testProxy: (config: ProxyConfig) =>
		window.electron.network.testProxy(config),

	// ============ 请求日志 ============

	getLogEnabled: () => window.electron.network.getLogEnabled(),

	setLogEnabled: (enabled: boolean) =>
		window.electron.network.setLogEnabled(enabled),

	getRequestLog: () => window.electron.network.getRequestLog(),

	clearRequestLog: () => window.electron.network.clearRequestLog(),

	onRequestLogEntry: (callback: (entry: RequestLogEntry) => void) =>
		window.electron.network.onRequestLogEntry(callback),
};
