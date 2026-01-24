import type { Skill } from '../types/skills'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SkillState {
  skills: Skill[]
  installSkill: (skill: Skill) => void
  uninstallSkill: (id: string) => void
}

export const useSkillStore = create<SkillState>()(
  persist(
    set => ({
      skills: [],
      installSkill: skill =>
        set(state => ({
          skills: [...state.skills, { ...skill, installed: true }],
        })),
      uninstallSkill: id =>
        set(state => ({
          skills: state.skills.filter(s => s.id !== id),
        })),
    }),
    {
      name: 'skill-storage',
    },
  ),
)
