/**
 * 插件系统类型定义
 */

// 插件权限类型
export type PluginPermission =
	| "fs.read" // 读取插件目录内文件
	| "fs.write" // 写入插件目录内文件
	| "fs.readExternal" // 读取插件目录外文件
	| "fs.writeExternal" // 写入插件目录外文件
	| "network" // HTTP 请求
	| "window.notify" // 显示通知/消息对话框
	| "window.input" // 显示输入对话框
	| "storage" // 持久化存储
	| "commands" // 注册命令
	| "events" // 订阅应用事件
	| "chat.hooks" // 聊天管道钩子
	| "mcp.tools" // 注册 MCP 工具
	| "skills.create" // 创建 Skill
	| "ui.sidebar" // 侧边栏
	| "ui.settings" // 设置面板
	| "ui.pages"; // 自定义页面

// 权限描述映射（用于 UI 显示）
export const PERMISSION_DESCRIPTIONS: Record<PluginPermission, string> = {
	"fs.read": "读取插件目录内的文件",
	"fs.write": "写入插件目录内的文件",
	"fs.readExternal": "读取插件目录外的文件",
	"fs.writeExternal": "写入插件目录外的文件",
	network: "发送网络请求",
	"window.notify": "显示通知和消息对话框",
	"window.input": "显示输入和选择对话框",
	storage: "持久化存储数据",
	commands: "注册和执行命令",
	events: "订阅应用事件",
	"chat.hooks": "介入 AI 聊天流程",
	"mcp.tools": "注册 MCP 工具",
	"skills.create": "创建 Skill 技能",
	"ui.sidebar": "在侧边栏添加菜单项",
	"ui.settings": "在设置中添加配置面板",
	"ui.pages": "注册自定义页面",
};

// 插件激活时机
export type ActivationEvent =
	| "onStartup" // 应用启动时
	| "onCommand" // 调用命令时
	| "onView" // 打开视图时
	| `onCommand:${string}` // 特定命令
	| `onView:${string}`; // 特定视图

// 插件贡献点
export interface PluginContributions {
	// 命令
	commands?: Array<{
		command: string;
		title: string;
		category?: string;
		icon?: string;
		when?: string;
	}>;

	// 菜单
	menus?: {
		[key: string]: Array<{
			command: string;
			when?: string;
			group?: string;
		}>;
	};

	// 视图容器
	viewsContainers?: {
		[key: string]: Array<{
			id: string;
			title: string;
			icon: string;
		}>;
	};

	// 视图
	views?: {
		[key: string]: Array<{
			id: string;
			name: string;
			when?: string;
		}>;
	};

	// 配置
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

	// 快捷键
	keybindings?: Array<{
		command: string;
		key: string;
		when?: string;
		mac?: string;
		linux?: string;
		win?: string;
	}>;

	// 资源
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
	// 必需字段
	name: string; // 插件ID（唯一标识）
	displayName: string; // 显示名称
	version: string; // 版本号
	main: string; // 入口文件

	// 可选字段
	description?: string;
	author?: string | { name: string; email?: string };
	license?: string;
	keywords?: string[];
	categories?: string[];
	icon?: string;
	repository?: { type: string; url: string };
	homepage?: string;
	bugs?: { url: string; email?: string };

	// 引擎要求
	engines: {
		"super-client-r": string; // 支持的App版本范围
		node?: string;
	};

	// 权限声明
	permissions?: PluginPermission[];

	// 激活事件
	activationEvents?: ActivationEvent[];

	// 贡献点
	contributes?: PluginContributions;

	// 依赖
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;

	// 脚本
	scripts?: Record<string, string>;
}

// 插件状态
export type PluginState =
	| "installing" // 安装中
	| "installed" // 已安装但未启用
	| "activating" // 激活中
	| "active" // 已激活运行
	| "deactivating" // 停用中
	| "inactive" // 已停用
	| "error" // 错误状态
	| "uninstalling"; // 卸载中

// 插件信息（存储）
export interface PluginInfo {
	id: string; // 插件ID
	manifest: PluginManifest; // 插件清单
	state: PluginState; // 当前状态
	path: string; // 安装路径
	installedAt: number; // 安装时间
	updatedAt: number; // 更新时间
	enabled: boolean; // 是否启用
	isBuiltin: boolean; // 是否内置插件
	isDev: boolean; // 是否开发模式
	error?: string; // 错误信息
}

// 插件API接口（提供给插件使用）
export interface PluginAPI {
	// 版本
	readonly version: string;

	// 命令
	commands: {
		registerCommand(
			command: string,
			callback: (...args: unknown[]) => unknown,
		): () => void;
		executeCommand(command: string, ...args: unknown[]): Promise<unknown>;
	};

	// 事件
	events: {
		onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
		onDidChangeActiveTextEditor: EventEmitter<unknown>;
		onDidChangeWindowState: EventEmitter<WindowState>;
	};

	// 存储
	storage: {
		get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
		set<T>(key: string, value: T): Promise<void>;
		delete(key: string): Promise<void>;
	};

	// 窗口
	window: {
		showInformationMessage(
			message: string,
			...items: string[]
		): Promise<string | undefined>;
		showWarningMessage(
			message: string,
			...items: string[]
		): Promise<string | undefined>;
		showErrorMessage(
			message: string,
			...items: string[]
		): Promise<string | undefined>;
		showInputBox(options?: InputBoxOptions): Promise<string | undefined>;
		showQuickPick<T extends QuickPickItem>(
			items: T[],
			options?: QuickPickOptions,
		): Promise<T | undefined>;
	};

	// 网络
	network: {
		fetch(url: string, init?: RequestInit): Promise<Response>;
	};

	// 文件系统
	fs: {
		readFile(path: string): Promise<Uint8Array>;
		writeFile(path: string, data: Uint8Array): Promise<void>;
		readTextFile(path: string): Promise<string>;
		writeTextFile(path: string, content: string): Promise<void>;
		exists(path: string): Promise<boolean>;
		mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
		readdir(path: string): Promise<string[]>;
		stat(path: string): Promise<FileStat>;
		delete(path: string, options?: { recursive?: boolean }): Promise<void>;
	};

	// 日志
	logger: {
		trace(message: string, ...args: unknown[]): void;
		debug(message: string, ...args: unknown[]): void;
		info(message: string, ...args: unknown[]): void;
		warn(message: string, ...args: unknown[]): void;
		error(message: string, ...args: unknown[]): void;
	};

	// 聊天钩子
	chat: {
		onPreSend(handler: PreSendHook): { dispose(): void };
		onSystemPrompt(handler: SystemPromptHook): { dispose(): void };
		onPostStream(handler: PostStreamHook): { dispose(): void };
		onPostResponse(handler: PostResponseHook): { dispose(): void };
	};

	// MCP 工具注册
	mcp: {
		registerTools(config: PluginMcpToolConfig): { dispose(): void };
	};

	// Skill 注册
	skills: {
		registerSkill(config: PluginSkillConfig): { dispose(): void };
	};

	// UI 扩展
	ui: {
		registerSidebarItem(config: SidebarItemConfig): { dispose(): void };
		registerPage(config: PageConfig): { dispose(): void };
	};

	// 扩展路径
	readonly extensionPath: string;

	// 订阅管理
	readonly subscriptions: { dispose(): void }[];
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

// 聊天钩子类型
export interface PreSendHookContext {
	messages: Array<{ role: string; content: string }>;
	systemPrompt?: string;
	/** 设置为 true 可阻止消息发送 */
	cancelled?: boolean;
}

export type PreSendHook = (ctx: PreSendHookContext) => Promise<void> | void;

export interface SystemPromptHookContext {
	systemPrompt: string;
}

export type SystemPromptHook = (
	ctx: SystemPromptHookContext,
) => Promise<void> | void;

export interface PostStreamHookContext {
	chunk: string;
}

export type PostStreamHook = (
	ctx: PostStreamHookContext,
) => Promise<void> | void;

export interface PostResponseHookContext {
	response: string;
}

export type PostResponseHook = (
	ctx: PostResponseHookContext,
) => Promise<void> | void;

// MCP 工具注册配置
export interface PluginMcpToolConfig {
	id: string;
	name: string;
	description: string;
	tools: Array<{
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
		handler: (
			args: Record<string, unknown>,
		) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
	}>;
}

// Skill 注册配置
export interface PluginSkillConfig {
	id: string;
	name: string;
	description: string;
	icon?: string;
	category?: string;
	systemPrompt?: string;
	tools: Array<{
		name: string;
		description: string;
		inputSchema: Record<string, unknown>;
		handler: (input: Record<string, unknown>) => Promise<unknown>;
	}>;
}

// UI 贡献配置
export interface SidebarItemConfig {
	id: string;
	label: string;
	icon: string;
	iconType?: "default" | "emoji";
	path?: string;
	order?: number;
}

export interface PageConfig {
	id: string;
	path: string;
	title: string;
	htmlFile: string;
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
	/** Full PluginAPI instance (available after Phase 1) */
	readonly api?: PluginAPI;
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
