/**
 * IPC 通道定义
 * 定义主进程和渲染进程之间的通信通道
 */

// Agent SDK 相关通道（基于 @anthropic-ai/claude-agent-sdk）
export const AGENT_SDK_CHANNELS = {
	// 创建查询（启动 agent）
	CREATE_QUERY: "agent-sdk:create-query",
	// 中断当前查询
	INTERRUPT: "agent-sdk:interrupt",
	// 关闭查询
	CLOSE: "agent-sdk:close",
	// 恢复会话
	RESUME_SESSION: "agent-sdk:resume-session",
	// 列出 SDK sessions
	LIST_SESSIONS: "agent-sdk:list-sessions",
	// 获取 session 信息
	GET_SESSION_INFO: "agent-sdk:get-session-info",
	// 切换模型
	SET_MODEL: "agent-sdk:set-model",
	// 流式事件 (main → renderer)
	STREAM_EVENT: "agent-sdk:stream-event",
	// 权限审批响应 (renderer → main)
	PERMISSION_RESPONSE: "agent-sdk:permission-response",
	// Session 操作
	FORK_SESSION: "agent-sdk:fork-session",
	RENAME_SESSION: "agent-sdk:rename-session",
	TAG_SESSION: "agent-sdk:tag-session",
	GET_SESSION_MESSAGES: "agent-sdk:get-session-messages",
	// 配置
	GET_CONFIG: "agent-sdk:get-config",
	SET_CONFIG: "agent-sdk:set-config",
	// Multi-Agent 角色和团队
	GET_PROFILES: "agent-sdk:get-profiles",
	SET_PROFILES: "agent-sdk:set-profiles",
	GET_TEAMS: "agent-sdk:get-teams",
	SET_TEAMS: "agent-sdk:set-teams",
} as const;

// Agent 相关通道（旧版，待清理）
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

// MCP 相关通道
export const MCP_CHANNELS = {
	// 连接 MCP 服务器
	CONNECT: "mcp:connect",
	// 断开连接
	DISCONNECT: "mcp:disconnect",
	// 获取服务器列表
	LIST_SERVERS: "mcp:list-servers",
	// 获取服务器工具
	GET_TOOLS: "mcp:get-tools",
	// 添加服务器
	ADD_SERVER: "mcp:add-server",
	// 移除服务器
	REMOVE_SERVER: "mcp:remove-server",
	// 更新服务器配置
	UPDATE_SERVER: "mcp:update-server",
	// 获取所有状态
	GET_ALL_STATUS: "mcp:get-all-status",
} as const;

// 系统信息相关通道
export const SYSTEM_CHANNELS = {
	// 获取用户主目录
	GET_HOMEDIR: "system:get-homedir",
	// 获取环境信息（用于系统提示词注入）
	GET_ENV_INFO: "system:get-env-info",
	// 获取进程性能指标
	GET_PROCESS_METRICS: "system:get-process-metrics",
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
	// 获取 API 密钥
	GET_API_KEY: "api:get-api-key",
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

// 日志系统相关通道
export const LOG_CHANNELS = {
	// 查询日志
	QUERY: "log:query",
	// 获取统计信息
	GET_STATS: "log:get-stats",
	// 获取模块列表
	GET_MODULES: "log:get-modules",
	// 渲染进程日志转发
	RENDERER_LOG: "log:renderer-log",
	// 清除数据库
	CLEAR_DB: "log:clear-db",
	// 导出日志
	EXPORT: "log:export",
	// 打开日志查看器窗口
	OPEN_VIEWER: "log:open-viewer",
} as const;

// 更新相关通道
export const UPDATE_CHANNELS = {
	// 检查更新
	CHECK: "update:check",
	// 下载更新
	DOWNLOAD: "update:download",
	// 安装更新
	INSTALL: "update:install",
	// 事件 (main → renderer)
	CHECKING: "update:checking",
	AVAILABLE: "update:available",
	NOT_AVAILABLE: "update:not-available",
	PROGRESS: "update:progress",
	DOWNLOADED: "update:downloaded",
	ERROR: "update:error",
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

// LLM 调用相关通道
export const LLM_CHANNELS = {
	// 发起聊天补全请求
	CHAT_COMPLETION: "llm:chat-completion",
	// 停止流式响应
	STOP_STREAM: "llm:stop-stream",
	// 流式事件 (main → renderer)
	STREAM_EVENT: "llm:stream-event",
	// 工具审批响应 (renderer → main)
	TOOL_APPROVAL_RESPONSE: "llm:tool-approval-response",
} as const;

// 插件权限和 UI 通道
export const PLUGIN_CHANNELS = {
	// 权限
	GRANT_PERMISSIONS: "plugin:grantPermissions",
	GET_PERMISSIONS: "plugin:getPermissions",
	// 对话框（main → renderer → main）
	SHOW_MESSAGE: "plugin:showMessage",
	SHOW_INPUT_BOX: "plugin:showInputBox",
	SHOW_QUICK_PICK: "plugin:showQuickPick",
	// UI 贡献
	GET_UI_CONTRIBUTIONS: "plugin:getUIContributions",
	UI_CONTRIBUTIONS_CHANGED: "plugin:ui-contributions-changed",
	GET_PLUGIN_PAGE_HTML: "plugin:getPluginPageHTML",
	// 开发模式
	INSTALL_DEV: "plugin:installDev",
	RELOAD_DEV: "plugin:reloadDev",
	// 更新
	CHECK_UPDATES: "plugin:checkUpdates",
	UPDATE_PLUGIN: "plugin:updatePlugin",
} as const;

// IM Bot 相关通道
export const IMBOT_CHANNELS = {
	// 机器人管理
	LIST_BOTS: "imbot:list",
	START_BOT: "imbot:start",
	STOP_BOT: "imbot:stop",
	GET_BOT_STATUS: "imbot:get-status",
	// 消息发送
	SEND_MESSAGE: "imbot:send-message",
} as const;

// Remote Device 相关通道
export const REMOTE_DEVICE_CHANNELS = {
	// 设备管理
	LIST_DEVICES: "remote-device:list",
	REGISTER_DEVICE: "remote-device:register",
	REMOVE_DEVICE: "remote-device:remove",
	GET_DEVICE: "remote-device:get",
	// 命令执行
	EXECUTE_COMMAND: "remote-device:execute-command",
	// 终止命令
	KILL_COMMAND: "remote-device:kill-command",
	// Tab 补全
	TAB_COMPLETE: "remote-device:tab-complete",
	// 获取当前工作目录
	GET_CWD: "remote-device:get-cwd",
	// 命令输出流式推送 (main → renderer)
	COMMAND_OUTPUT: "remote-device:command-output",
	// Relay 配置
	GET_RELAY_CONFIG: "remote-device:get-relay-config",
	SET_RELAY_CONFIG: "remote-device:set-relay-config",
} as const;

// Remote Control Events 相关通道
export const REMOTE_CONTROL_CHANNELS = {
	// 获取所有事件
	GET_EVENTS: "remote-control:get-events",
	// 清空事件
	CLEAR_EVENTS: "remote-control:clear-events",
	// 新事件推送 (main → renderer)
	NEW_EVENT: "remote-control:new-event",
	// 获取设备连接信息
	GET_CONNECTION_INFO: "remote-control:get-connection-info",
} as const;

// Remote Chat Bridge 相关通道
export const REMOTE_CHAT_CHANNELS = {
	BIND: "remote-chat:bind",
	UNBIND: "remote-chat:unbind",
	GET_BINDING: "remote-chat:get-binding",
	CHECK_BOT_ONLINE: "remote-chat:check-bot-online",
	SEND_MESSAGE: "remote-chat:send-message",
	GET_REMOTE_MESSAGES: "remote-chat:get-remote-messages",
	IM_MESSAGE: "remote-chat:im-message",
} as const;

// Network 相关通道（代理 + 请求日志）
export const NETWORK_CHANNELS = {
	// 代理配置
	GET_PROXY_CONFIG: "network:get-proxy-config",
	SET_PROXY_CONFIG: "network:set-proxy-config",
	TEST_PROXY: "network:test-proxy",
	// 请求日志
	GET_REQUEST_LOG: "network:get-request-log",
	SET_LOG_ENABLED: "network:set-log-enabled",
	GET_LOG_ENABLED: "network:get-log-enabled",
	CLEAR_REQUEST_LOG: "network:clear-request-log",
	// 实时推送 (main → renderer)
	REQUEST_LOG_ENTRY: "network:request-log-entry",
} as const;

// 所有通道的联合类型
export type IPCChannel =
	| (typeof AGENT_SDK_CHANNELS)[keyof typeof AGENT_SDK_CHANNELS]
	| (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS]
	| (typeof MCP_CHANNELS)[keyof typeof MCP_CHANNELS]
	| (typeof APP_CHANNELS)[keyof typeof APP_CHANNELS]
	| (typeof API_CHANNELS)[keyof typeof API_CHANNELS]
	| (typeof WINDOW_CHANNELS)[keyof typeof WINDOW_CHANNELS]
	| (typeof FLOAT_WIDGET_CHANNELS)[keyof typeof FLOAT_WIDGET_CHANNELS]
	| (typeof THEME_CHANNELS)[keyof typeof THEME_CHANNELS]
	| (typeof LOG_CHANNELS)[keyof typeof LOG_CHANNELS]
	| (typeof FILE_CHANNELS)[keyof typeof FILE_CHANNELS]
	| (typeof UPDATE_CHANNELS)[keyof typeof UPDATE_CHANNELS]
	| (typeof LLM_CHANNELS)[keyof typeof LLM_CHANNELS]
	| (typeof SYSTEM_CHANNELS)[keyof typeof SYSTEM_CHANNELS]
	| (typeof PLUGIN_CHANNELS)[keyof typeof PLUGIN_CHANNELS]
	| (typeof IMBOT_CHANNELS)[keyof typeof IMBOT_CHANNELS]
	| (typeof REMOTE_DEVICE_CHANNELS)[keyof typeof REMOTE_DEVICE_CHANNELS]
	| (typeof REMOTE_CONTROL_CHANNELS)[keyof typeof REMOTE_CONTROL_CHANNELS]
	| (typeof REMOTE_CHAT_CHANNELS)[keyof typeof REMOTE_CHAT_CHANNELS]
	| (typeof NETWORK_CHANNELS)[keyof typeof NETWORK_CHANNELS];
