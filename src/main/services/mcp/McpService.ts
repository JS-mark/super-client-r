/**
 * MCP (Model Context Protocol) 服务
 * 管理 MCP 服务器的连接和工具调用
 */

import { EventEmitter } from 'events'
import type { McpServerConfig, McpServerStatus, McpTool } from '../../ipc/types'

export class McpService extends EventEmitter {
  private servers: Map<string, McpServerConfig> = new Map()
  private serverStatus: Map<string, McpServerStatus> = new Map()

  /**
   * 添加 MCP 服务器配置
   */
  addServer(config: McpServerConfig): void {
    this.servers.set(config.id, config)
    this.serverStatus.set(config.id, {
      id: config.id,
      status: 'disconnected',
    })
    this.emit('server-added', config)
  }

  /**
   * 移除 MCP 服务器
   */
  removeServer(id: string): void {
    this.disconnect(id)
    this.servers.delete(id)
    this.serverStatus.delete(id)
    this.emit('server-removed', id)
  }

  /**
   * 获取所有服务器配置
   */
  listServers(): McpServerConfig[] {
    return Array.from(this.servers.values())
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(id: string): McpServerStatus | undefined {
    return this.serverStatus.get(id)
  }

  /**
   * 获取所有服务器状态
   */
  getAllServerStatus(): McpServerStatus[] {
    return Array.from(this.serverStatus.values())
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(id: string): Promise<McpServerStatus> {
    const config = this.servers.get(id)
    if (!config) {
      throw new Error(`Server ${id} not found`)
    }

    const status = this.serverStatus.get(id)!
    status.status = 'connected'

    // TODO: 实现实际的 MCP 连接逻辑
    // 这里应该使用 @modelcontextprotocol/sdk 建立连接
    // 并获取可用的工具列表

    // 模拟工具列表
    status.tools = [
      {
        name: 'example_tool',
        description: 'An example MCP tool',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
        },
      },
    ]

    this.serverStatus.set(id, status)
    this.emit('connected', status)

    return status
  }

  /**
   * 断开 MCP 服务器连接
   */
  disconnect(id: string): void {
    const status = this.serverStatus.get(id)
    if (status) {
      status.status = 'disconnected'
      status.tools = undefined
      this.serverStatus.set(id, status)
      this.emit('disconnected', id)
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const status = this.serverStatus.get(serverId)
    if (!status || status.status !== 'connected') {
      throw new Error(`Server ${serverId} is not connected`)
    }

    // TODO: 实现实际的工具调用逻辑
    // 这里应该使用 MCP SDK 调用工具

    this.emit('tool-called', { serverId, toolName, args })

    return { result: `Called ${toolName} with args: ${JSON.stringify(args)}` }
  }

  /**
   * 获取服务器的所有工具
   */
  getServerTools(serverId: string): McpTool[] {
    return this.serverStatus.get(serverId)?.tools || []
  }

  /**
   * 获取所有可用工具（来自所有已连接的服务器）
   */
  getAllAvailableTools(): Array<{ serverId: string; tool: McpTool }> {
    const tools: Array<{ serverId: string; tool: McpTool }> = []

    for (const [id, status] of this.serverStatus.entries()) {
      if (status.status === 'connected' && status.tools) {
        for (const tool of status.tools) {
          tools.push({ serverId: id, tool })
        }
      }
    }

    return tools
  }
}

// 单例实例
export const mcpService = new McpService()