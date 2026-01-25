import type { ModelInfo } from '../types/models'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ModelState {
  models: ModelInfo[]
  activeModelId: string | null
  addModel: (model: ModelInfo) => void
  updateModel: (id: string, updates: Partial<ModelInfo>) => void
  removeModel: (id: string) => void
  setActiveModel: (id: string) => void
}

export const useModelStore = create<ModelState>()(
  persist(
    set => ({
      models: [
        {
          id: 'openai-gpt-4',
          name: 'GPT-4',
          provider: 'openai' as const,
          capabilities: ['chat'],
          enabled: !!import.meta.env.VITE_OPENAI_API_KEY,
          config: { apiKey: import.meta.env.VITE_OPENAI_API_KEY },
        },
        {
          id: 'claude-3-opus',
          name: 'Claude 3 Opus',
          provider: 'anthropic' as const,
          capabilities: ['chat'],
          enabled: !!import.meta.env.VITE_ANTHROPIC_API_KEY,
          config: { apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY },
        },
        {
          id: 'gemini-pro',
          name: 'Gemini Pro',
          provider: 'gemini' as const,
          capabilities: ['chat'],
          enabled: !!import.meta.env.VITE_GEMINI_API_KEY,
          config: { apiKey: import.meta.env.VITE_GEMINI_API_KEY },
        },
      ].filter(m => m.enabled),
      activeModelId: null,
      addModel: model => set(state => ({ models: [...state.models, model] })),
      updateModel: (id, updates) =>
        set(state => ({
          models: state.models.map(m => (m.id === id ? { ...m, ...updates } : m)),
        })),
      removeModel: id =>
        set(state => ({ models: state.models.filter(m => m.id !== id) })),
      setActiveModel: id => set({ activeModelId: id }),
    }),
    {
      name: 'model-storage',
    },
  ),
)
