/**
 * MCP IPC 处理器
 * 处理来自渲染进程的 MCP 相关请求
 */

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { MCP_CHANNELS } from '../channels'
import type { McpServerConfig } from '../types'
import { mcpService } from '../../services/mcp/McpService'

/**
 * 注册 MCP IPC 处理器
 */
export function registerMcpHandlers(): void {
  // 连接服务器
  ipcMain.handle(MCP_CHANNELS.CONNECT, async (_event: IpcMainInvokeEvent, id: string) => {
    try {
      const status = await mcpService.connect(id)
      return { success: true, data: status }
    }
    catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 断开连接
  ipcMain.handle(MCP_CHANNELS.DISCONNECT, (_event: IpcMainInvokeEvent, id: string) => {
    mcpService.disconnect(id)
    return { success: true }
  })

  // 列出服务器
  ipcMain.handle(MCP_CHANNELS.LIST_SERVERS, () => {
    const servers = mcpService.listServers()
    return { success: true, data: servers }
  })

  // 获取服务器工具
  ipcMain.handle(MCP_CHANNELS.GET_TOOLS, (_event: IpcMainInvokeEvent, id: string) => {
    const tools = mcpService.getServerTools(id)
    return { success: true, data: tools }
  })

  // 添加服务器
  ipcMain.handle('mcp:add-server', (_event: IpcMainInvokeEvent, config: McpServerConfig) => {
    mcpService.addServer(config)
    return { success: true }
  })

  // 移除服务器
  ipcMain.handle('mcp:remove-server', (_event: IpcMainInvokeEvent, id: string) => {
    mcpService.removeServer(id)
    return { success: true }
  })

  // 获取所有服务器状态
  ipcMain.handle('mcp:get-all-status', () => {
    const statuses = mcpService.getAllServerStatus()
    return { success: true, data: statuses }
  })

  // 调用工具
  ipcMain.handle(
    'mcp:call-tool',
    async (
      _event: IpcMainInvokeEvent,
      serverId: string,
      toolName: string,
      args: Record<string, unknown>,
    ) => {
      try {
        const result = await mcpService.callTool(serverId, toolName, args)
        return { success: true, data: result }
      }
      catch (error: any) {
        return { success: false, error: error.message }
      }
    },
  )

  // 获取所有可用工具
  ipcMain.handle('mcp:get-all-tools', () => {
    const tools = mcpService.getAllAvailableTools()
    return { success: true, data: tools }
  })
}