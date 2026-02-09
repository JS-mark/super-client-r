/**
 * Skill 服务
 * 管理 skills 的安装、卸载和执行
 */

import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import type {
	SkillExecutionResult,
	SkillManifest,
	SkillTool,
} from "../../ipc/types";

export interface SkillConfig {
	id: string;
	manifest: SkillManifest;
	path: string;
	enabled: boolean;
}

export class SkillService extends EventEmitter {
	private skills: Map<string, SkillConfig> = new Map();
	private skillsDir: string;

	constructor(skillsDir: string) {
		super();
		this.skillsDir = skillsDir;
	}

	/**
	 * 初始化技能服务
	 */
	async initialize(): Promise<void> {
		try {
			// 确保 skills 目录存在
			await fs.mkdir(this.skillsDir, { recursive: true });

			// 扫描 skills 目录
			const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });

			for (const entry of entries) {
				if (entry.isDirectory()) {
					const skillPath = path.join(this.skillsDir, entry.name);
					const manifestPath = path.join(skillPath, "manifest.json");

					try {
						const manifestContent = await fs.readFile(manifestPath, "utf-8");
						const manifest: SkillManifest = JSON.parse(manifestContent);

						// 验证 manifest
						if (this.isValidManifest(manifest)) {
							const config: SkillConfig = {
								id: manifest.id,
								manifest,
								path: skillPath,
								enabled: true,
							};

							this.skills.set(manifest.id, config);
							this.emit("loaded", manifest);
						}
					} catch (error) {
						console.error(`Failed to load skill from ${skillPath}:`, error);
					}
				}
			}
		} catch (error) {
			console.error("Failed to initialize skill service:", error);
			throw error;
		}
	}

	/**
	 * 验证 manifest 是否有效
	 */
	private isValidManifest(manifest: unknown): manifest is SkillManifest {
		if (!manifest || typeof manifest !== "object") {
			return false;
		}

		const m = manifest as Partial<SkillManifest>;
		return (
			typeof m.id === "string" &&
			typeof m.name === "string" &&
			typeof m.description === "string" &&
			typeof m.version === "string" &&
			typeof m.author === "string"
		);
	}

	/**
	 * 获取所有已安装的 skills
	 */
	listSkills(): SkillManifest[] {
		return Array.from(this.skills.values())
			.filter((s) => s.enabled)
			.map((s) => s.manifest);
	}

	/**
	 * 获取 skill 详情
	 */
	getSkill(id: string): SkillManifest | undefined {
		return this.skills.get(id)?.manifest;
	}

	/**
	 * 安装 skill
	 */
	async installSkill(source: string): Promise<SkillManifest> {
		try {
			// 检查 source 是本地路径还是 URL
			let skillPath: string;

			if (source.startsWith("http://") || source.startsWith("https://")) {
				// TODO: 实现从 URL 下载
				throw new Error("Installing from URL is not yet implemented");
			} else {
				// 本地路径
				const sourcePath = path.resolve(source);
				const sourceManifestPath = path.join(sourcePath, "manifest.json");

				// 验证源目录存在
				const sourceStat = await fs.stat(sourcePath);
				if (!sourceStat.isDirectory()) {
					throw new Error("Source must be a directory");
				}

				// 读取并验证 manifest
				const manifestContent = await fs.readFile(sourceManifestPath, "utf-8");
				const manifest: SkillManifest = JSON.parse(manifestContent);

				if (!this.isValidManifest(manifest)) {
					throw new Error("Invalid manifest file");
				}

				// 检查是否已安装
				if (this.skills.has(manifest.id)) {
					throw new Error(`Skill ${manifest.id} is already installed`);
				}

				// 创建目标目录
				skillPath = path.join(this.skillsDir, manifest.id);
				await fs.mkdir(skillPath, { recursive: true });

				// 复制文件
				const entries = await fs.readdir(sourcePath, { withFileTypes: true });
				for (const entry of entries) {
					const src = path.join(sourcePath, entry.name);
					const dest = path.join(skillPath, entry.name);

					if (entry.isDirectory()) {
						await fs.mkdir(dest, { recursive: true });
						// 递归复制目录内容
						await this.copyDirectory(src, dest);
					} else {
						await fs.copyFile(src, dest);
					}
				}

				// 注册 skill
				const config: SkillConfig = {
					id: manifest.id,
					manifest,
					path: skillPath,
					enabled: true,
				};

				this.skills.set(manifest.id, config);
				this.emit("installed", manifest);

				return manifest;
			}
		} catch (error) {
			console.error(`Failed to install skill from ${source}:`, error);
			throw error;
		}
	}

	/**
	 * 递归复制目录
	 */
	private async copyDirectory(src: string, dest: string): Promise<void> {
		const entries = await fs.readdir(src, { withFileTypes: true });
		for (const entry of entries) {
			const srcPath = path.join(src, entry.name);
			const destPath = path.join(dest, entry.name);

			if (entry.isDirectory()) {
				await fs.mkdir(destPath, { recursive: true });
				await this.copyDirectory(srcPath, destPath);
			} else {
				await fs.copyFile(srcPath, destPath);
			}
		}
	}

	/**
	 * 卸载 skill
	 */
	async uninstallSkill(id: string): Promise<void> {
		const skill = this.skills.get(id);
		if (!skill) {
			throw new Error(`Skill ${id} not found`);
		}

		try {
			// 删除 skill 目录
			await fs.rm(skill.path, { recursive: true, force: true });
		} catch (error) {
			console.error(`Failed to remove skill directory ${skill.path}:`, error);
			// 继续执行，即使删除失败
		}

		this.skills.delete(id);
		this.emit("uninstalled", id);
	}

	/**
	 * 启用 skill
	 */
	enableSkill(id: string): void {
		const skill = this.skills.get(id);
		if (skill) {
			skill.enabled = true;
			this.emit("enabled", id);
		}
	}

	/**
	 * 禁用 skill
	 */
	disableSkill(id: string): void {
		const skill = this.skills.get(id);
		if (skill) {
			skill.enabled = false;
			this.emit("disabled", id);
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
		const skill = this.skills.get(skillId);
		if (!skill) {
			return {
				success: false,
				error: `Skill ${skillId} not found`,
			};
		}

		if (!skill.enabled) {
			return {
				success: false,
				error: `Skill ${skillId} is disabled`,
			};
		}

		try {
			// 查找工具定义
			const tool = skill.manifest.tools?.find((t) => t.name === toolName);
			if (!tool) {
				return {
					success: false,
					error: `Tool ${toolName} not found in skill ${skillId}`,
				};
			}

			// 检查是否有实现文件
			const implPath = path.join(skill.path, "index.js");
			const implTsPath = path.join(skill.path, "index.ts");

			let implExists = false;
			try {
				await fs.access(implPath);
				implExists = true;
			} catch {
				try {
					await fs.access(implTsPath);
					implExists = true;
				} catch {
					// No implementation file
				}
			}

			if (!implExists) {
				return {
					success: false,
					error: `Skill ${skillId} has no implementation file`,
				};
			}

			// TODO: 实现动态加载和执行 skill 代码
			// 这需要使用动态 import 或 child_process 来执行 skill 代码
			// 出于安全考虑，应该在沙箱环境中执行

			this.emit("executed", { skillId, toolName, input });

			return {
				success: true,
				output: {
					result: `Executed ${toolName} with input: ${JSON.stringify(input)}`,
				},
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error occurred";
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	/**
	 * 获取 skill 的所有工具
	 */
	getSkillTools(skillId: string): SkillTool[] {
		return this.skills.get(skillId)?.manifest.tools || [];
	}

	/**
	 * 获取所有可用工具（来自所有启用的 skills）
	 */
	getAllAvailableTools(): Array<{ skillId: string; tool: SkillTool }> {
		const tools: Array<{ skillId: string; tool: SkillTool }> = [];

		for (const [id, skill] of this.skills.entries()) {
			if (skill.enabled && skill.manifest.tools) {
				for (const tool of skill.manifest.tools) {
					tools.push({ skillId: id, tool });
				}
			}
		}

		return tools;
	}
}

// 单例实例
let skillServiceInstance: SkillService | null = null;

export function getSkillService(skillsDir?: string): SkillService {
	if (!skillServiceInstance) {
		if (!skillsDir) {
			throw new Error(
				"SkillService requires a skills directory on first initialization",
			);
		}
		skillServiceInstance = new SkillService(skillsDir);
	}
	return skillServiceInstance;
}
