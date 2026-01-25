import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { skillService } from '../services/skillService'
import type { Skill } from '../types/skills'

interface SkillState {
  installedSkills: Skill[]
  marketSkills: Skill[]
  isLoading: boolean

  fetchMarketSkills: () => Promise<void>
  installSkill: (skill: Skill) => void
  uninstallSkill: (id: string) => void
  updateSkill: (id: string) => void
  reinstallSkill: (id: string) => void
  checkUpdate: (id: string) => boolean
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      installedSkills: [],
      marketSkills: [],
      isLoading: false,

      fetchMarketSkills: async () => {
        set({ isLoading: true })
        try {
          const skills = await skillService.getMarketSkills()
          set({ marketSkills: skills, isLoading: false })
        } catch (error) {
          console.error('Failed to fetch market skills', error)
          set({ isLoading: false })
        }
      },

      installSkill: (skill) =>
        set((state) => {
          if (state.installedSkills.some((s) => s.id === skill.id))
            return state
          return {
            installedSkills: [...state.installedSkills, { ...skill, installed: true }],
          }
        }),

      uninstallSkill: (id) =>
        set((state) => ({
          installedSkills: state.installedSkills.filter((s) => s.id !== id),
        })),

      updateSkill: (id) => {
        const state = get()
        const marketSkill = state.marketSkills.find((s) => s.id === id)
        if (!marketSkill)
          return

        set((state) => ({
          installedSkills: state.installedSkills.map((s) =>
            s.id === id ? { ...marketSkill, installed: true } : s,
          ),
        }))
      },

      reinstallSkill: (id) => {
        const state = get()
        const marketSkill = state.marketSkills.find((s) => s.id === id) || state.installedSkills.find((s) => s.id === id)
        if (!marketSkill)
          return

        set((state) => ({
          installedSkills: state.installedSkills.map((s) =>
            s.id === id ? { ...marketSkill, installed: true } : s,
          ),
        }))
      },

      checkUpdate: (id) => {
        const state = get()
        const installed = state.installedSkills.find((s) => s.id === id)
        const market = state.marketSkills.find((s) => s.id === id)
        if (!installed || !market)
          return false
        // 简单的版本比较，实际可能需要 semver
        return market.version !== installed.version
      },
    }),
    {
      name: 'skill-storage',
      partialize: (state) => ({ installedSkills: state.installedSkills }),
    },
  ),
)
