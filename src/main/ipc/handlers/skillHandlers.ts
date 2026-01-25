/**
 * Skill IPC 处理器
 * 处理来自渲染进程的 skill 相关请求
 */

import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { SKILL_CHANNELS } from '../channels'
import { getSkillService } from '../../services/skill/SkillService'

/**
 * 注册 Skill IPC 处理器
 */
export function registerSkillHandlers(): void {
  // 列出 skills
  ipcMain.handle(SKILL_CHANNELS.LIST_SKILLS, () => {
    const skillService = getSkillService()
    const skills = skillService.listSkills()
    return { success: true, data: skills }
  })

  // 安装 skill
  ipcMain.handle(SKILL_CHANNELS.INSTALL_SKILL, async (_event: IpcMainInvokeEvent, source: string) => {
    try {
      const skillService = getSkillService()
      const manifest = await skillService.installSkill(source)
      return { success: true, data: manifest }
    }
    catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 卸载 skill
  ipcMain.handle(SKILL_CHANNELS.UNINSTALL_SKILL, async (_event: IpcMainInvokeEvent, id: string) => {
    try {
      const skillService = getSkillService()
      await skillService.uninstallSkill(id)
      return { success: true }
    }
    catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 获取 skill 详情
  ipcMain.handle(SKILL_CHANNELS.GET_SKILL, (_event: IpcMainInvokeEvent, id: string) => {
    const skillService = getSkillService()
    const skill = skillService.getSkill(id)
    if (!skill) {
      return { success: false, error: 'Skill not found' }
    }
    return { success: true, data: skill }
  })

  // 执行 skill
  ipcMain.handle(
    SKILL_CHANNELS.EXECUTE_SKILL,
    async (
      _event: IpcMainInvokeEvent,
      skillId: string,
      toolName: string,
      input: Record<string, unknown>,
    ) => {
      try {
        const skillService = getSkillService()
        const result = await skillService.executeSkill(skillId, toolName, input)
        return { success: true, data: result }
      }
      catch (error: any) {
        return { success: false, error: error.message }
      }
    },
  )

  // 获取所有可用工具
  ipcMain.handle('skill:get-all-tools', () => {
    const skillService = getSkillService()
    const tools = skillService.getAllAvailableTools()
    return { success: true, data: tools }
  })

  // 启用 skill
  ipcMain.handle('skill:enable', (_event: IpcMainInvokeEvent, id: string) => {
    const skillService = getSkillService()
    skillService.enableSkill(id)
    return { success: true }
  })

  // 禁用 skill
  ipcMain.handle('skill:disable', (_event: IpcMainInvokeEvent, id: string) => {
    const skillService = getSkillService()
    skillService.disableSkill(id)
    return { success: true }
  })
}