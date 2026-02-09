/**
 * Skill Hook
 * 管理 Skills 的安装、卸载和执行
 */

import { useCallback, useEffect, useState } from "react";
import { skillClient } from "../services/skill/skillService";
import type {
	SkillExecutionResult,
	SkillManifest,
	SkillTool,
} from "../types/electron";

export function useSkill() {
	const [skills, setSkills] = useState<SkillManifest[]>([]);
	const [loading, setLoading] = useState(false);
	const [tools, setTools] = useState<
		Array<{ skillId: string; tool: SkillTool }>
	>([]);

	// 加载 skills 列表
	const loadSkills = useCallback(async () => {
		setLoading(true);
		try {
			const data = await skillClient.listSkills();
			setSkills(data);
		} catch (error) {
			console.error("Failed to load skills:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	// 安装 skill
	const installSkill = useCallback(async (source: string) => {
		setLoading(true);
		try {
			const manifest = await skillClient.installSkill(source);
			setSkills((prev) => [...prev, manifest]);
			return manifest;
		} catch (error: any) {
			throw new Error(error.message || "Failed to install skill");
		} finally {
			setLoading(false);
		}
	}, []);

	// 卸载 skill
	const uninstallSkill = useCallback(async (id: string) => {
		setLoading(true);
		try {
			await skillClient.uninstallSkill(id);
			setSkills((prev) => prev.filter((s) => s.id !== id));
		} catch (error: any) {
			throw new Error(error.message || "Failed to uninstall skill");
		} finally {
			setLoading(false);
		}
	}, []);

	// 获取 skill 详情
	const getSkill = useCallback(async (id: string) => {
		try {
			return await skillClient.getSkill(id);
		} catch (error: any) {
			throw new Error(error.message || "Failed to get skill");
		}
	}, []);

	// 执行 skill
	const executeSkill = useCallback(
		async (
			skillId: string,
			toolName: string,
			input: Record<string, unknown>,
		): Promise<SkillExecutionResult> => {
			try {
				return await skillClient.executeSkill(skillId, toolName, input);
			} catch (error: any) {
				throw new Error(error.message || "Failed to execute skill");
			}
		},
		[],
	);

	// 加载所有可用工具
	const loadTools = useCallback(async () => {
		try {
			const data = await skillClient.getAllTools();
			setTools(data);
		} catch (error) {
			console.error("Failed to load tools:", error);
		}
	}, []);

	// 启用 skill
	const enableSkill = useCallback(
		async (id: string) => {
			try {
				await skillClient.enableSkill(id);
				await loadSkills();
			} catch (error: any) {
				throw new Error(error.message || "Failed to enable skill");
			}
		},
		[loadSkills],
	);

	// 禁用 skill
	const disableSkill = useCallback(
		async (id: string) => {
			try {
				await skillClient.disableSkill(id);
				await loadSkills();
			} catch (error: any) {
				throw new Error(error.message || "Failed to disable skill");
			}
		},
		[loadSkills],
	);

	// 初始化时加载
	useEffect(() => {
		loadSkills();
		loadTools();
	}, [loadSkills, loadTools]);

	return {
		skills,
		tools,
		loading,
		loadSkills,
		installSkill,
		uninstallSkill,
		getSkill,
		executeSkill,
		enableSkill,
		disableSkill,
	};
}
