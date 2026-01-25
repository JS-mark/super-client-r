/**
 * IPC 通信类型定义
 */

// ============ Agent 相关类型 ============

export interface AgentSession {
  id: string
  name: string
  model: string
  createdAt: number
  status: 'idle' | 'running' | 'stopped' | 'error'
}

export interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  toolUse?: ToolUse[]
}

export interface ToolUse {
  id: string
  name: string
  input: Record<string, unknown>
  result?: unknown
  status: 'pending' | 'success' | 'error'
}

export interface AgentStreamEvent {
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'done'
  sessionId: string
  data: unknown
}

// ============ Skill 相关类型 ============

export interface SkillManifest {
  id: string
  name: string
  description: string
  version: string
  author: string
  category?: string
  icon?: string
  permissions?: string[]
  tools?: SkillTool[]
}

export interface SkillTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface SkillExecutionResult {
  success: boolean
  output?: unknown
  error?: string
}

// ============ MCP 相关类型 ============

export interface McpServerConfig {
  id: string
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpServerStatus {
  id: string
  status: 'connected' | 'disconnected' | 'error'
  tools?: McpTool[]
  error?: string
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// ============ Chat 相关类型 ============

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  model?: string
}

export interface ChatHistory {
  sessionId: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// ============ IPC 请求/响应类型 ============

export interface IPCRequest<T = unknown> {
  id?: string
  payload?: T
}

export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface IPCStreamData<T = unknown> {
  type: string
  data: T
}