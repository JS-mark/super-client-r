/**
 * Skill 服务
 * 管理 skills 的安装、卸载和执行
 */

import { EventEmitter } from 'events'
import type { SkillExecutionResult, SkillManifest, SkillTool } from '../../ipc/types'

export interface SkillConfig {
  id: string
  manifest: SkillManifest
  path: string
  enabled: boolean
}

export class SkillService extends EventEmitter {
  private skills: Map<string, SkillConfig> = new Map()
  private skillsDir: string

  constructor(skillsDir: string) {
    super()
    this.skillsDir = skillsDir
  }

  /**
   * 初始化技能服务
   */
  async initialize(): Promise<void> {
    // TODO: 从 skills 目录加载已安装的 skills
    // 这里可以扫描目录并加载 manifest.json 文件
  }

  /**
   * 获取所有已安装的 skills
   */
  listSkills(): SkillManifest[] {
    return Array.from(this.skills.values())
      .filter(s => s.enabled)
      .map(s => s.manifest)
  }

  /**
   * 获取 skill 详情
   */
  getSkill(id: string): SkillManifest | undefined {
    return this.skills.get(id)?.manifest
  }

  /**
   * 安装 skill
   */
  async installSkill(source: string): Promise<SkillManifest> {
    // TODO: 实现实际的 skill 安装逻辑
    // 1. 下载或复制 skill 文件
    // 2. 验证 manifest
    // 3. 注册到 skills map

    const manifest: SkillManifest = {
      id: `skill_${Date.now()}`,
      name: 'Example Skill',
      description: 'An example skill',
      version: '1.0.0',
      author: 'Unknown',
      category: 'utility',
      tools: [
        {
          name: 'example_tool',
          description: 'An example tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
        },
      ],
    }

    const config: SkillConfig = {
      id: manifest.id,
      manifest,
      path: source,
      enabled: true,
    }

    this.skills.set(manifest.id, config)
    this.emit('installed', manifest)

    return manifest
  }

  /**
   * 卸载 skill
   */
  async uninstallSkill(id: string): Promise<void> {
    const skill = this.skills.get(id)
    if (!skill) {
      throw new Error(`Skill ${id} not found`)
    }

    // TODO: 清理 skill 文件

    this.skills.delete(id)
    this.emit('uninstalled', id)
  }

  /**
   * 启用 skill
   */
  enableSkill(id: string): void {
    const skill = this.skills.get(id)
    if (skill) {
      skill.enabled = true
      this.emit('enabled', id)
    }
  }

  /**
   * 禁用 skill
   */
  disableSkill(id: string): void {
    const skill = this.skills.get(id)
    if (skill) {
      skill.enabled = false
      this.emit('disabled', id)
    }
  }

  /**
   * 执行 skill
   */
  async executeSkill(
    skillId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<SkillExecutionResult> {
    const skill = this.skills.get(skillId)
    if (!skill) {
      return {
        success: false,
        error: `Skill ${skillId} not found`,
      }
    }

    if (!skill.enabled) {
      return {
        success: false,
        error: `Skill ${skillId} is disabled`,
      }
    }

    // TODO: 实现实际的 skill 执行逻辑
    // 这里应该调用 skill 的实际实现

    this.emit('executed', { skillId, toolName, input })

    return {
      success: true,
      output: { result: `Executed ${toolName} with input: ${JSON.stringify(input)}` },
    }
  }

  /**
   * 获取 skill 的所有工具
   */
  getSkillTools(skillId: string): SkillTool[] {
    return this.skills.get(skillId)?.manifest.tools || []
  }

  /**
   * 获取所有可用工具（来自所有启用的 skills）
   */
  getAllAvailableTools(): Array<{ skillId: string; tool: SkillTool }> {
    const tools: Array<{ skillId: string; tool: SkillTool }> = []

    for (const [id, skill] of this.skills.entries()) {
      if (skill.enabled && skill.manifest.tools) {
        for (const tool of skill.manifest.tools) {
          tools.push({ skillId: id, tool })
        }
      }
    }

    return tools
  }
}

// 单例实例
let skillServiceInstance: SkillService | null = null

export function getSkillService(skillsDir?: string): SkillService {
  if (!skillServiceInstance) {
    if (!skillsDir) {
      throw new Error('SkillService requires a skills directory on first initialization')
    }
    skillServiceInstance = new SkillService(skillsDir)
  }
  return skillServiceInstance
}