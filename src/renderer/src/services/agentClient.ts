import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

export class AgentClient {
  private sessionId: string | null = null
  private messageListeners: Map<string, (message: SDKMessage) => void> = new Map()

  async createSession(options: any = {}): Promise<string> {
    const result = await window.ipcRenderer.invoke('agent:createSession', options)
    if (result.error) {
      throw new Error(result.error)
    }
    this.sessionId = result.sessionId
    return this.sessionId!
  }

  async sendMessage(message: string, onMessage: (message: SDKMessage) => void): Promise<void> {
    if (!this.sessionId) {
      throw new Error('Session not initialized')
    }

    const channel = `agent:message:${this.sessionId}`

    // Set up listener
    const listener = (_event: any, sdkMessage: SDKMessage) => {
      onMessage(sdkMessage)
    }

    window.ipcRenderer.on(channel, listener)

    try {
      const result = await window.ipcRenderer.invoke('agent:sendMessage', {
        sessionId: this.sessionId,
        message
      })

      if (result.error) {
        throw new Error(result.error)
      }
    } finally {
      // Clean up listener?
      // For streaming, we might want to keep it until the stream ends.
      // But here we rely on the backend stream loop finishing.
      // Ideally, the backend should send a 'done' message or we infer it from SDKMessage.
      // For now, we leave the listener active. In a real app, we'd manage this better.
    }
  }

  async dispose(): Promise<void> {
    if (this.sessionId) {
      await window.ipcRenderer.invoke('agent:disposeSession', { sessionId: this.sessionId })
      const channel = `agent:message:${this.sessionId}`
      window.ipcRenderer.removeAllListeners(channel)
      this.sessionId = null
    }
  }
}

export const agentClient = new AgentClient()
