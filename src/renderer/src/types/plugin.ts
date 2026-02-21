/**
 * 插件系统类型定义（渲染进程使用）
 * 与主进程类型保持同步
 */

// 插件激活时机
export type ActivationEvent =
	| "onStartup"
	| "onCommand"
	| "onView"
	| `onCommand:${string}`
	| `onView:${string}`;

// 插件贡献点
export interface PluginContributions {
	commands?: Array<{
		command: string;
		title: string;
		category?: string;
		icon?: string;
		when?: string;
	}>;
	menus?: {
		[key: string]: Array<{
			command: string;
			when?: string;
			group?: string;
		}>;
	};
	viewsContainers?: {
		[key: string]: Array<{
			id: string;
			title: string;
			icon: string;
		}>;
	};
	views?: {
		[key: string]: Array<{
			id: string;
			name: string;
			when?: string;
		}>;
	};
	configuration?: {
		title: string;
		properties: Record<
			string,
			{
				type: string;
				default?: unknown;
				description: string;
				enum?: string[];
				enumDescriptions?: string[];
			}
		>;
	};
	keybindings?: Array<{
		command: string;
		key: string;
		when?: string;
		mac?: string;
		linux?: string;
		win?: string;
	}>;
	resources?: {
		[key: string]: string;
	};

	// 主题/皮肤
	themes?: Array<{
		id: string;
		label: string;
		icon?: string;
		style: string;
		antdTokens?: string;
	}>;
}

// 插件清单
export interface PluginManifest {
	name: string;
	displayName: string;
	version: string;
	main: string;
	description?: string;
	author?: string | { name: string; email?: string };
	license?: string;
	keywords?: string[];
	categories?: string[];
	icon?: string;
	repository?: { type: string; url: string };
	homepage?: string;
	bugs?: { url: string; email?: string };
	engines: {
		"super-client-r": string;
		node?: string;
	};
	activationEvents?: ActivationEvent[];
	contributes?: PluginContributions;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

// 插件状态
export type PluginState =
	| "installing"
	| "installed"
	| "activating"
	| "active"
	| "deactivating"
	| "inactive"
	| "error"
	| "uninstalling";

// 插件信息
export interface PluginInfo {
	id: string;
	manifest: PluginManifest;
	state: PluginState;
	path: string;
	installedAt: number;
	updatedAt: number;
	enabled: boolean;
	isBuiltin: boolean;
	isDev: boolean;
	error?: string;
}

// 市场插件
export interface MarketPlugin {
	id: string;
	name: string;
	displayName: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	categories: string[];
	downloads: number;
	rating: number;
	installed?: boolean;
}

// 事件发射器
export interface EventEmitter<T> {
	event: (listener: (e: T) => unknown) => () => void;
	fire(data: T): void;
}

// 配置变更事件
export interface ConfigurationChangeEvent {
	affectsConfiguration(section: string): boolean;
}

// 窗口状态
export interface WindowState {
	focused: boolean;
	active: boolean;
}

// 输入框选项
export interface InputBoxOptions {
	value?: string;
	valueSelection?: [number, number];
	prompt?: string;
	placeHolder?: string;
	password?: boolean;
	ignoreFocusOut?: boolean;
	validateInput?(
		value: string,
	): string | undefined | Promise<string | undefined>;
}

// QuickPick 选项
export interface QuickPickItem {
	label: string;
	description?: string;
	detail?: string;
	picked?: boolean;
}

export interface QuickPickOptions {
	canPickMany?: boolean;
	ignoreFocusOut?: boolean;
	matchOnDescription?: boolean;
	matchOnDetail?: boolean;
	placeHolder?: string;
}

// 文件统计信息
export interface FileStat {
	type: "file" | "directory" | "symlink";
	size: number;
	ctime: number;
	mtime: number;
}

// 插件命令
export interface PluginCommand {
	command: string;
	pluginId: string;
	title?: string;
	category?: string;
}

// 插件激活上下文
export interface PluginContext {
	readonly extensionPath: string;
	readonly extensionUri: string;
	readonly storageUri: string;
	readonly globalStorageUri: string;
	readonly logUri: string;
	readonly subscriptions: { dispose(): void }[];
	readonly workspaceState: Memento;
	readonly globalState: Memento;
	readonly commands: {
		registerCommand(
			command: string,
			callback: (...args: unknown[]) => unknown,
		): { dispose(): void };
	};
}

// 存储接口
export interface Memento {
	get<T>(key: string, defaultValue?: T): T | undefined;
	update(key: string, value: unknown): Promise<void>;
}

// 插件主入口接口
export interface Plugin {
	activate(context: PluginContext): Promise<void> | void;
	deactivate?(): Promise<void> | void;
}
