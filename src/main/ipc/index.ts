/**
 * IPC 模块入口
 * 统一注册所有 IPC 处理器
 */

import { registerAgentHandlers } from './handlers/agentHandlers'
import { registerSkillHandlers } from './handlers/skillHandlers'
import { registerMcpHandlers } from './handlers/mcpHandlers'

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(): void {
  registerAgentHandlers()
  registerSkillHandlers()
  registerMcpHandlers()
}

export * from './channels'
export * from './types'