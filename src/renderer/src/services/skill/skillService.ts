/**
 * Skill 服务（渲染进程）
 * 封装与主进程的 Skill 通信
 */

import type {
	SkillExecutionResult,
	SkillManifest,
	SkillTool,
} from "../../types/electron";

export class SkillClient {
	/**
	 * 列出所有已安装的 skills
	 */
	async listSkills(): Promise<SkillManifest[]> {
		const response = await window.electron.skill.listSkills();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to list skills");
		}
		return response.data;
	}

	/**
	 * 安装 skill
	 */
	async installSkill(source: string): Promise<SkillManifest> {
		const response = await window.electron.skill.installSkill(source);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to install skill");
		}
		return response.data;
	}

	/**
	 * 卸载 skill
	 */
	async uninstallSkill(id: string): Promise<void> {
		const response = await window.electron.skill.uninstallSkill(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to uninstall skill");
		}
	}

	/**
	 * 获取 skill 详情
	 */
	async getSkill(id: string): Promise<SkillManifest> {
		const response = await window.electron.skill.getSkill(id);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get skill");
		}
		return response.data;
	}

	/**
	 * 执行 skill
	 */
	async executeSkill(
		skillId: string,
		toolName: string,
		input: Record<string, unknown>,
	): Promise<SkillExecutionResult> {
		const response = await window.electron.skill.executeSkill(
			skillId,
			toolName,
			input,
		);
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to execute skill");
		}
		return response.data;
	}

	/**
	 * 获取所有可用工具
	 */
	async getAllTools(): Promise<Array<{ skillId: string; tool: SkillTool }>> {
		const response = await window.electron.skill.getAllTools();
		if (!response.success || !response.data) {
			throw new Error(response.error || "Failed to get tools");
		}
		return response.data;
	}

	/**
	 * 启用 skill
	 */
	async enableSkill(id: string): Promise<void> {
		const response = await window.electron.skill.enableSkill(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to enable skill");
		}
	}

	/**
	 * 禁用 skill
	 */
	async disableSkill(id: string): Promise<void> {
		const response = await window.electron.skill.disableSkill(id);
		if (!response.success) {
			throw new Error(response.error || "Failed to disable skill");
		}
	}
}

// 单例实例
export const skillClient = new SkillClient();
