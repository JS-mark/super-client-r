/**
 * IPC 通道定义
 *
 * 大部分通道已由 Typed IPC Proxy（register.ts）自动生成。
 * 此文件仅保留需要手动引用的通道常量。
 */

// LLM 调用相关通道（modelHandlers.ts + LLMService.ts 使用）
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

// 更新相关通道（updateService.ts 使用）
export const UPDATE_CHANNELS = {
	// 事件 (main → renderer)
	CHECKING: "update:checking",
	AVAILABLE: "update:available",
	NOT_AVAILABLE: "update:not-available",
	PROGRESS: "update:progress",
	DOWNLOADED: "update:downloaded",
	ERROR: "update:error",
} as const;

// PTY (终端) 通道（ptyHandlers.ts + PtyService.ts 使用）
export const PTY_CHANNELS = {
	// renderer → main
	CREATE: "pty:create",
	WRITE: "pty:write",
	RESIZE: "pty:resize",
	KILL: "pty:kill",
	LIST: "pty:list",
	// main → renderer
	DATA: "pty:data",
	EXIT: "pty:exit",
} as const;

// 诊断导出通道（无 renderer-provided output path）
export const DIAGNOSTICS_CHANNELS = {
	EXPORT: "diagnostics:export",
} as const;

// 插件事件通道（PluginManager 服务直接发送，保留 camelCase）
export const PLUGIN_EVENT_CHANNELS = {
	SHOW_MESSAGE: "plugin:showMessage",
	SHOW_INPUT_BOX: "plugin:showInputBox",
	SHOW_QUICK_PICK: "plugin:showQuickPick",
	UI_CONTRIBUTIONS_CHANGED: "plugin:ui-contributions-changed",
} as const;
