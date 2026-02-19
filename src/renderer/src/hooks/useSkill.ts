/**
 * Skill Hook
 * 管理 Skills 的安装、卸载、执行和市场
 */

import { useCallback, useEffect, useState } from "react";
import { skillClient } from "../services/skill/skillService";
import { skillService } from "../services/skillService";
import { useSkillStore } from "../stores/skillStore";
import type {
	SkillExecutionResult,
	SkillManifest,
	SkillTool,
} from "../types/electron";
import type { Skill } from "../types/skills";

export function useSkill() {
	const [skills, setSkills] = useState<SkillManifest[]>([]);
	const [loading, setLoading] = useState(false);
	const [tools, setTools] = useState<
		Array<{ skillId: string; tool: SkillTool }>
	>([]);

	// Store integration for market functionality
	const {
		installedSkills,
		marketSkills,
		isLoading: storeLoading,
		marketPage,
		marketLimit,
		marketTotal,
		marketDomain,
		fetchMarketSkills,
		setMarketDomain,
		installSkill: installToStore,
		updateSkill: updateInStore,
	} = useSkillStore();

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

	// ========== Market Functions ==========

	// Load market skills
	const loadMarketSkills = useCallback(
		async (page?: number, limit?: number, domain?: string) => {
			try {
				await fetchMarketSkills(page, limit, domain);
			} catch (error) {
				console.error("Failed to load market skills:", error);
			}
		},
		[fetchMarketSkills],
	);

	// Get skill details from market
	const getMarketSkillDetails = useCallback(
		async (id: string): Promise<Skill | undefined> => {
			try {
				return await skillService.getSkillDetails(id);
			} catch (error) {
				console.error("Failed to get skill details:", error);
				return undefined;
			}
		},
		[],
	);

	// Install skill from market
	const installFromMarket = useCallback(
		async (skill: Skill) => {
			setLoading(true);
			try {
				// Install via skill client
				if (skill.repository || skill.homepage) {
					const manifest = await skillClient.installSkill(
						skill.repository || skill.homepage || "",
					);
					setSkills((prev) => [...prev, manifest]);
				}
				// Add to store
				installToStore(skill);
			} catch (error: any) {
				throw new Error(error.message || "Failed to install skill from market");
			} finally {
				setLoading(false);
			}
		},
		[installToStore],
	);

	// Check if skill has update
	const checkUpdate = useCallback(
		(id: string): boolean => {
			const installed = installedSkills.find((s) => s.id === id);
			const market = marketSkills.find((s) => s.id === id);
			if (!installed || !market) return false;
			return market.version !== installed.version;
		},
		[installedSkills, marketSkills],
	);

	// Update skill
	const updateSkill = useCallback(
		async (id: string) => {
			setLoading(true);
			try {
				// In real implementation, this would fetch latest version
				await skillClient.installSkill(id);
				await loadSkills();
				updateInStore(id);
			} catch (error: any) {
				throw new Error(error.message || "Failed to update skill");
			} finally {
				setLoading(false);
			}
		},
		[loadSkills, updateInStore],
	);

	// 初始化时加载
	useEffect(() => {
		loadSkills();
		loadTools();
		if (marketSkills.length === 0) {
			loadMarketSkills();
		}
	}, [loadSkills, loadTools, loadMarketSkills, marketSkills.length]);

	return {
		// Local state
		skills,
		tools,
		loading: loading || storeLoading,
		loadSkills,
		installSkill,
		uninstallSkill,
		getSkill,
		executeSkill,
		enableSkill,
		disableSkill,
		updateSkill,
		checkUpdate,

		// Market state
		installedSkills,
		marketSkills,
		marketPage,
		marketLimit,
		marketTotal,
		marketDomain,

		// Market actions
		loadMarketSkills,
		setMarketDomain,
		getMarketSkillDetails,
		installFromMarket,
	};
}
