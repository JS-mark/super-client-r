/**
 * Extension Descriptor 类型定义（§20）
 *
 * 统一只读视图，聚合 MCP 服务器、已安装的 Skills、App Plugins 等扩展资源。
 * 描述符仅做投影：管理（增/删/改）仍由各自的服务表面负责。
 */

export type ExtensionType =
	| "mcp"
	| "skill"
	| "hook"
	| "app-plugin"
	| "theme"
	| "capability-package";

export type ExtensionSource =
	| "builtin"
	| "market"
	| "third-party"
	| "plugin"
	| "internal";

export type ExtensionScope = "global" | "workspace" | "session";

export type ExtensionHealth = "active" | "inactive" | "error" | "unknown";

export interface ExtensionBackingRef {
	service: "mcp" | "skill" | "plugin";
	id: string;
}

export interface ExtensionDescriptor {
	id: string;
	type: ExtensionType;
	source: ExtensionSource;
	scope: ExtensionScope;
	name: string;
	description?: string;
	enabled: boolean;
	health: ExtensionHealth;
	permissions: string[];
	contributionPoints: string[];
	backingRef: ExtensionBackingRef;
}
