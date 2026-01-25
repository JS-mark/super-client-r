import Anthropic from '@anthropic-ai/sdk'

export class ClaudeService {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    })
  }

  async streamMessage(
    messages: Anthropic.MessageParam[],
    model: string,
    onChunk: (text: string) => void,
  ): Promise<void> {
    const stream = await this.client.messages.create({
      model,
      messages,
      max_tokens: 4096,
      stream: true,
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        onChunk(chunk.delta.text)
      }
    }
  }
}
