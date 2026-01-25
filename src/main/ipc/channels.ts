/**
 * IPC 通道定义
 * 定义主进程和渲染进程之间的通信通道
 */

// Agent 相关通道
export const AGENT_CHANNELS = {
  // 创建 agent 会话
  CREATE_SESSION: 'agent:create-session',
  // 发送消息到 agent
  SEND_MESSAGE: 'agent:send-message',
  // 获取 agent 状态
  GET_STATUS: 'agent:get-status',
  // 停止 agent
  STOP_AGENT: 'agent:stop',
  // 获取可用 agents
  LIST_AGENTS: 'agent:list',
  // Agent 事件流
  STREAM_EVENT: 'agent:stream-event',
} as const

// Skill 相关通道
export const SKILL_CHANNELS = {
  // 获取已安装 skills
  LIST_SKILLS: 'skill:list',
  // 安装 skill
  INSTALL_SKILL: 'skill:install',
  // 卸载 skill
  UNINSTALL_SKILL: 'skill:uninstall',
  // 获取 skill 详情
  GET_SKILL: 'skill:get',
  // 执行 skill
  EXECUTE_SKILL: 'skill:execute',
} as const

// Chat 相关通道
export const CHAT_CHANNELS = {
  // 发送消息
  SEND_MESSAGE: 'chat:send-message',
  // 获取历史消息
  GET_HISTORY: 'chat:get-history',
  // 清除历史
  CLEAR_HISTORY: 'chat:clear',
} as const

// MCP 相关通道
export const MCP_CHANNELS = {
  // 连接 MCP 服务器
  CONNECT: 'mcp:connect',
  // 断开连接
  DISCONNECT: 'mcp:disconnect',
  // 获取服务器列表
  LIST_SERVERS: 'mcp:list',
  // 获取服务器工具
  GET_TOOLS: 'mcp:get-tools',
} as const

// 所有通道的联合类型
export type IPCChannel =
  | (typeof AGENT_CHANNELS)[keyof typeof AGENT_CHANNELS]
  | (typeof SKILL_CHANNELS)[keyof typeof SKILL_CHANNELS]
  | (typeof CHAT_CHANNELS)[keyof typeof CHAT_CHANNELS]
  | (typeof MCP_CHANNELS)[keyof typeof MCP_CHANNELS]