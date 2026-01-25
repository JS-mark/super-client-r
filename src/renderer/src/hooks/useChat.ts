import { App } from 'antd'
import { useState } from 'react'
import { ClaudeService } from '../services/llm/claude'
import { useChatStore } from '../stores/chatStore'
import { useModelStore } from '../stores/modelStore'

export function useChat() {
  const { message } = App.useApp()
  const { messages, isStreaming, addMessage, updateLastMessage, setStreaming, clearMessages } = useChatStore()
  const { models } = useModelStore()
  const [input, setInput] = useState('')

  const sendMessage = async () => {
    if (!input.trim() || isStreaming)
      return

    const activeModel = models.find(m => m.enabled) // Simple selection for now
    if (!activeModel) {
      message.error('No enabled model found. Please configure a model first.')
      return
    }

    if (!activeModel.config.apiKey) {
      message.error('API Key missing for the selected model.')
      return
    }

    const userMessage = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: input,
      timestamp: Date.now(),
    }

    addMessage(userMessage)
    setInput('')
    setStreaming(true)

    const assistantMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant' as const,
      content: '',
      timestamp: Date.now(),
    }
    addMessage(assistantMessage)

    try {
      const claude = new ClaudeService(activeModel.config.apiKey)

      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
      }))

      let fullContent = ''
      await claude.streamMessage(
        [...history, { role: 'user', content: userMessage.content }] as any,
        activeModel.name || 'claude-3-5-sonnet-20241022',
        (text) => {
          fullContent += text
          updateLastMessage(fullContent)
        },
      )
    }
    catch (error: any) {
      message.error(`Error: ${error.message}`)
      updateLastMessage(`Error: ${error.message}`)
    }
    finally {
      setStreaming(false)
    }
  }

  return {
    messages,
    input,
    setInput,
    sendMessage,
    isStreaming,
    clearMessages,
  }
}
