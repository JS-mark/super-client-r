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
      models: [],
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
