/**
 * IPC 通道定义
 * 定义主进程和渲染进程之间的通信通道
 */

// Agent 相关通道
export const AGENT_CHANNELS = {
	// 创建 agent 会话
	CREATE_SESSION: "agent:create-session",
	// 发送消息到 agent
	SEND_MESSAGE: "agent:send-message",
	// 获取 agent 状态
	GET_STATUS: "agent:get-status",
	// 停止 agent
	STOP_AGENT: "agent:stop",
	// 获取可用 agents
	LIST_AGENTS: "agent:list",
	// Agent 事件流
	STREAM_EVENT: "agent:stream-event",
} as const;

// Skill 相关通道
export const SKILL_CHANNELS = {
	// 获取已安装 skills
	LIST_SKILLS: "skill:list",
	// 安装 skill
	INSTALL_SKILL: "skill:install",
	// 卸载 skill
	UNINSTALL_SKILL: "skill:uninstall",
	// 获取 skill 详情
	GET_SKILL: "skill:get",
	// 执行 skill
	EXECUTE_SKILL: "skill:execute",
} as const;

// Chat 相关通道
export const CHAT_CHANNELS = {
	// 发送消息
	SEND_MESSAGE: "chat:send-message",
	// 获取历史消息
	GET_HISTORY: "chat:get-history",
	// 清除历史
	CLEAR_HISTORY: "chat:clear",
} as const;

// MCP 相关通道
export const MCP_CHANNELS = {
	// 连接 MCP 服务器
	CONNECT: "mcp:connect",
	// 断开连接
	DISCONNECT: "mcp:disconnect",
	// 获取服务器列表
	LIST_SERVERS: "mcp:list",
	// 获取服务器工具
	GET_TOOLS: "mcp:get-tools",
} as const;

// App 相关通道
export const APP_CHANNELS = {
	// 获取应用信息 (版本、名称等)
	GET_INFO: "app:get-info",
	// 获取用户数据路径
	GET_USER_DATA_PATH: "app:get-user-data-path",
	// 打开路径 (文件夹或文件)
	OPEN_PATH: "app:open-path",
	// 检查更新
	CHECK_UPDATE: "app:check-update",
	// 退出应用
	QUIT: "app:quit",
	// 重启应用
	RELAUNCH: "app:relaunch",
	// 打开开发者工具
	OPEN_DEV_TOOLS: "app:open-dev-tools",
	// 获取日志内容
	GET_LOGS: "app:get-logs",
	// 获取日志目录路径
	GET_LOGS_PATH: "app:get-logs-path",
	// 获取日志文件列表
	LIST_LOG_FILES: "app:list-log-files",
	// 清除日志
	CLEAR_LOGS: "app:clear-logs",
	// 打开外部链接
	OPEN_EXTERNAL: "app:open-external",
} as const;

// API Server 相关通道
export const API_CHANNELS = {
	// 获取服务器状态
	GET_STATUS: "api:get-status",
	// 启动服务器
	START: "api:start",
	// 停止服务器
	STOP: "api:stop",
	// 重启服务器
	RESTART: "api:restart",
	// 设置端口
	SET_PORT: "api:set-port",
} as const;

// 窗口控制相关通道
export const WINDOW_CHANNELS = {
	// 最小化窗口
	MINIMIZE: "window:minimize",
	// 最大化/还原窗口
	MAXIMIZE: "window:maximize",
	// 关闭窗口
	CLOSE: "window:close",
	// 获取窗口最大化状态
	IS_MAXIMIZED: "window:is-maximized",
	// 监听窗口最大化状态变化
	ON_MAXIMIZE_CHANGE: "window:on-maximize-change",
} as const;

// 悬浮窗相关通道
export const FLOAT_WIDGET_CHANNELS = {
	// 显示悬浮窗
	SHOW: "float-widget:show",
	// 隐藏悬浮窗
	HIDE: "float-widget:hide",
	// 获取悬浮窗状态
	GET_STATUS: "float-widget:get-status",
} as const;

// 主题相关通道
export const THEME_CHANNELS = {
	// 获取主题设置
	GET_THEME: "theme:get",
	// 设置主题
	SET_THEME: "theme:set",
	// 主题变更事件
	ON_CHANGE: "theme:on-change",
} as const;

// 搜索相关通道
export const SEARCH_CHANNELS = {
	// 获取所有搜索配置
	GET_CONFIGS: "search:get-configs",
	// 保存搜索配置
	SAVE_CONFIG: "search:save-config",
	// 删除搜索配置
	DELETE_CONFIG: "search:delete-config",
	// 设置默认搜索引擎
	SET_DEFAULT: "search:set-default",
	// 获取默认搜索引擎
	GET_DEFAULT: "search:get-default",
	// 验证搜索配置
	VALIDATE_CONFIG: "search:validate-config",
} as const;

// 文件附件相关通道
export const FILE_CHANNELS = {
	// 选择文件
	SELECT_FILES: "file:select-files",
	// 读取文件内容
	READ_FILE: "file:read-file",
	// 保存文件到附件目录
	SAVE_ATTACHMENT: "file:save-attachment",
	// 删除附件
	DELETE_ATTACHMENT: "file:delete-attachment",
	// 获取附件列表
	LIST_ATTACHMENTS: "file:list-attachments",
	// 打开附件
	OPEN_ATTACHMENT: "file:open-attachment",
	// 获取附件路径
	GET_ATTACHMENT_PATH: "file:get-attachment-path",
	// 复制文件到剪贴板
	COPY_FILE: "file:copy-file",
} as const;

// 所有通道的联合类型
export type IPCChannel =
	| (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS]
	| (typeof SKILL_CHANNELS)[keyof typeof SKILL_CHANNELS]
	| (typeof CHAT_CHANNELS)[keyof typeof CHAT_CHANNELS]
	| (typeof MCP_CHANNELS)[keyof typeof MCP_CHANNELS]
	| (typeof APP_CHANNELS)[keyof typeof APP_CHANNELS]
	| (typeof API_CHANNELS)[keyof typeof API_CHANNELS]
	| (typeof WINDOW_CHANNELS)[keyof typeof WINDOW_CHANNELS]
	| (typeof FLOAT_WIDGET_CHANNELS)[keyof typeof FLOAT_WIDGET_CHANNELS]
	| (typeof THEME_CHANNELS)[keyof typeof THEME_CHANNELS]
	| (typeof SEARCH_CHANNELS)[keyof typeof SEARCH_CHANNELS]
	| (typeof FILE_CHANNELS)[keyof typeof FILE_CHANNELS];
