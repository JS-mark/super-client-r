/**
 * Skill 服务
 * 管理 skills 的安装、卸载和执行
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type {
	SkillCommand,
	SkillExecutionResult,
	SkillManifest,
	SkillTool,
	SkillValidationResult,
} from "../../ipc/types";
import { validateSkill as runValidation } from "./SkillValidator";

export interface SkillConfig {
	id: string;
	manifest: SkillManifest;
	path: string;
	enabled: boolean;
}

export interface DynamicSkillConfig extends SkillConfig {
	handlers: Record<
		string,
		(input: Record<string, unknown>) => Promise<unknown>
	>;
}

export class SkillService extends EventEmitter {
	private skills: Map<string, SkillConfig> = new Map();
	private skillsDir: string;
	private dynamicHandlers: Map<
		string,
		Record<string, (input: Record<string, unknown>) => Promise<unknown>>
	> = new Map();
	private dynamicOwners: Map<string, string> = new Map();

	constructor(skillsDir: string) {
		super();
		this.skillsDir = skillsDir;
	}

	/**
	 * 初始化技能服务
	 */
	async initialize(): Promise<void> {
		try {
			// 扫描用户数据目录下的 skills
			await fs.mkdir(this.skillsDir, { recursive: true });
			await this.scanSkillsDir(this.skillsDir);

			// 开发模式下额外扫描项目内置 skills 目录
			if (!app.isPackaged) {
				const builtinDir = path.join(app.getAppPath(), "skills");
				try {
					await fs.access(builtinDir);
					await this.scanSkillsDir(builtinDir);
				} catch {
					// 内置 skills 目录不存在，跳过
				}
			}
		} catch (error) {
			console.error("Failed to initialize skill service:", error);
			throw error;
		}
	}

	/**
	 * 扫描指定目录下的 skills
	 * 使用 SKILL.md + plugin.json（Claude Code 模式）
	 */
	private async scanSkillsDir(dir: string): Promise<void> {
		const entries = await fs.readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.isDirectory()) {
				const skillPath = path.join(dir, entry.name);
				const manifest = await this.discoverSkillMetadata(skillPath);
				if (!manifest) continue;

				// 跳过已加载的同 ID skill（用户目录优先）
				if (this.skills.has(manifest.id)) continue;

				// SKILL.md body is the base prompt; prompts/main.txt is appended as app-specific context
				const promptPath = path.join(skillPath, "prompts", "main.txt");
				try {
					const mainTxtPrompt = await fs.readFile(promptPath, "utf-8");
					if (mainTxtPrompt.trim()) {
						manifest.systemPrompt = manifest.systemPrompt
							? `${manifest.systemPrompt}\n\n${mainTxtPrompt}`
							: mainTxtPrompt;
					}
				} catch {
					// No prompts/main.txt, keep SKILL.md body as systemPrompt
				}

				// Discover slash commands from commands/*.md
				manifest.commands = await this.discoverCommands(skillPath, manifest.id);

				const config: SkillConfig = {
					id: manifest.id,
					manifest,
					path: skillPath,
					enabled: true,
				};

				this.skills.set(manifest.id, config);
				this.emit("loaded", manifest);
			}
		}
	}

	/**
	 * 从 skill 目录中发现元数据，返回合并后的 SkillManifest
	 *
	 * 查找路径：
	 * 1. skills/<id>/SKILL.md（Claude Code 标准布局）
	 * 2. SKILL.md（根目录）
	 *
	 * 元数据合并策略：
	 * - id: SKILL.md name
	 * - name（显示名）: plugin.json displayName > plugin.json description > SKILL.md name
	 * - description: plugin.json description > SKILL.md description
	 * - version: plugin.json version
	 * - author: plugin.json author.name
	 * - icon/category/tools: plugin.json
	 */
	private async discoverSkillMetadata(
		skillPath: string,
	): Promise<SkillManifest | null> {
		const skillMdPath = await this.findSkillMdPath(skillPath);
		if (!skillMdPath) return null;

		return this.buildManifestFromSkillMd(skillPath, skillMdPath);
	}

	/**
	 * 查找 SKILL.md 文件路径
	 */
	private async findSkillMdPath(skillPath: string): Promise<string | null> {
		// 1. skills/*/SKILL.md 布局
		const skillsSubDir = path.join(skillPath, "skills");
		try {
			const entries = await fs.readdir(skillsSubDir, { withFileTypes: true });
			for (const e of entries) {
				if (e.isDirectory()) {
					const candidate = path.join(skillsSubDir, String(e.name), "SKILL.md");
					try {
						await fs.access(candidate);
						return candidate;
					} catch {
						// continue
					}
				}
			}
		} catch {
			// no skills/ subdir
		}

		// 2. 根目录 SKILL.md
		const rootPath = path.join(skillPath, "SKILL.md");
		try {
			await fs.access(rootPath);
			return rootPath;
		} catch {
			return null;
		}
	}

	/**
	 * 从 SKILL.md + plugin.json 构建 SkillManifest
	 */
	private async buildManifestFromSkillMd(
		skillPath: string,
		skillMdPath: string,
	): Promise<SkillManifest | null> {
		try {
			const content = await fs.readFile(skillMdPath, "utf-8");
			const trimmed = content.trimStart();
			if (!trimmed.startsWith("---")) return null;

			const secondDash = trimmed.indexOf("---", 3);
			if (secondDash === -1) return null;

			const yamlBlock = trimmed.slice(3, secondDash).trim();
			const fmData: Record<string, string> = {};
			const lines = yamlBlock.split("\n");
			let i = 0;
			while (i < lines.length) {
				const line = lines[i];
				const match = line.match(/^(\S[\w-]*)\s*:\s*(.*)/);
				if (match) {
					const key = match[1];
					let value = match[2].trim();
					if (value === "|" || value === "|+") {
						const multiLines: string[] = [];
						i++;
						while (i < lines.length && /^\s+/.test(lines[i])) {
							multiLines.push(lines[i].replace(/^\s+/, ""));
							i++;
						}
						fmData[key] = multiLines.join("\n");
						continue;
					}
					if (
						(value.startsWith('"') && value.endsWith('"')) ||
						(value.startsWith("'") && value.endsWith("'"))
					) {
						value = value.slice(1, -1);
					}
					fmData[key] = value;
				}
				i++;
			}

			if (!fmData.name) return null;

			// 读取 plugin.json（唯一的补充元数据来源）
			let pluginVersion = "0.0.0";
			let pluginAuthor = "unknown";
			let pluginDesc = fmData.description || "";
			let pluginDisplayName: string | undefined;
			let pluginIcon: string | undefined;
			let pluginCategory: string | undefined;
			let pluginTools: SkillManifest["tools"];
			const pluginJsonPath = path.join(
				skillPath,
				".claude-plugin",
				"plugin.json",
			);
			try {
				const raw = await fs.readFile(pluginJsonPath, "utf-8");
				const pj = JSON.parse(raw);
				if (pj && typeof pj === "object") {
					if (typeof pj.version === "string") pluginVersion = pj.version;
					if (pj.author && typeof pj.author.name === "string")
						pluginAuthor = pj.author.name;
					if (typeof pj.description === "string") pluginDesc = pj.description;
					if (typeof pj.displayName === "string")
						pluginDisplayName = pj.displayName;
					if (typeof pj.icon === "string") pluginIcon = pj.icon;
					if (typeof pj.category === "string") pluginCategory = pj.category;
					if (Array.isArray(pj.tools)) pluginTools = pj.tools;
				}
			} catch {
				// no plugin.json
			}

			// Extract SKILL.md body (content after frontmatter) as systemPrompt
			const body = trimmed.slice(secondDash + 3).trim();

			return {
				id: fmData.name,
				name: pluginDisplayName ?? pluginDesc ?? fmData.name,
				description: pluginDesc || fmData.description || "",
				version: pluginVersion,
				author: pluginAuthor,
				category: pluginCategory,
				icon: pluginIcon,
				tools: pluginTools,
				systemPrompt: body || undefined,
			};
		} catch {
			return null;
		}
	}

	/**
	 * Discover slash commands from commands/*.md files
	 */
	private async discoverCommands(
		skillPath: string,
		skillId: string,
	): Promise<SkillCommand[]> {
		const commandsDir = path.join(skillPath, "commands");
		try {
			const entries = await fs.readdir(commandsDir, { withFileTypes: true });
			const commands: SkillCommand[] = [];

			for (const entry of entries) {
				if (!entry.isFile() || !entry.name.endsWith(".md")) continue;

				const cmdPath = path.join(commandsDir, entry.name);
				try {
					const raw = await fs.readFile(cmdPath, "utf-8");
					const trimmed = raw.trimStart();

					let description = "";
					let prompt = trimmed;
					let allowedTools: string[] | undefined;

					// Parse optional frontmatter
					if (trimmed.startsWith("---")) {
						const secondDash = trimmed.indexOf("---", 3);
						if (secondDash !== -1) {
							const yamlBlock = trimmed.slice(3, secondDash).trim();
							for (const line of yamlBlock.split("\n")) {
								const match = line.match(/^(\S[\w-]*)\s*:\s*(.*)/);
								if (match) {
									const key = match[1];
									let value = match[2].trim();
									if (
										(value.startsWith('"') && value.endsWith('"')) ||
										(value.startsWith("'") && value.endsWith("'"))
									) {
										value = value.slice(1, -1);
									}
									if (key === "description") description = value;
									if (key === "allowed-tools") {
										allowedTools = value
											.split(",")
											.map((s) => s.trim())
											.filter(Boolean);
									}
								}
							}
							prompt = trimmed.slice(secondDash + 3).trim();
						}
					}

					if (!prompt) continue;

					const name = entry.name.replace(/\.md$/, "");
					commands.push({
						name,
						skillId,
						description,
						prompt,
						allowedTools,
					});
				} catch {
					// Skip unreadable command files
				}
			}

			return commands;
		} catch {
			// No commands/ directory
			return [];
		}
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
	 * 校验 skill（供 IPC 和 installSkill 调用）
	 */
	async validateSkill(source: string): Promise<SkillValidationResult> {
		const sourcePath = path.resolve(source);
		const installedIds = Array.from(this.skills.keys());
		return runValidation(sourcePath, installedIds);
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

				// 执行校验
				const validation = await this.validateSkill(source);
				if (!validation.valid) {
					const summary = validation.issues
						.filter((i) => i.severity === "error")
						.map((i) => i.fallbackMessage)
						.join("; ");
					throw new Error(`Skill validation failed: ${summary}`);
				}

				const manifest = validation.manifest!;

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

		// Check dynamic handlers first (plugin-registered skills)
		const dynamicHandlerMap = this.dynamicHandlers.get(skillId);
		if (dynamicHandlerMap) {
			const handler = dynamicHandlerMap[toolName];
			if (handler) {
				try {
					const result = await handler(input);
					this.emit("executed", { skillId, toolName, input });
					return { success: true, output: result };
				} catch (error) {
					return {
						success: false,
						error:
							error instanceof Error ? error.message : "Unknown error occurred",
					};
				}
			}
			return {
				success: false,
				error: `Tool ${toolName} not found in dynamic skill ${skillId}`,
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
			const implCandidates = [
				path.join(skill.path, "index.js"),
				path.join(skill.path, "index.ts"),
				path.join(skill.path, "scripts", "index.js"),
				path.join(skill.path, "scripts", "index.ts"),
			];

			let resolvedImplPath: string | null = null;
			for (const candidate of implCandidates) {
				try {
					await fs.access(candidate);
					resolvedImplPath = candidate;
					break;
				} catch {
					// continue
				}
			}

			if (!resolvedImplPath) {
				return {
					success: false,
					error: `Skill ${skillId} has no implementation file`,
				};
			}

			// 动态加载并执行 skill 代码
			const modulePath = `file://${resolvedImplPath}`;
			const skillModule = await import(modulePath);

			// 查找匹配的导出函数: 优先 toolName，再 default 对象上的 toolName，最后 default 函数
			const handler =
				skillModule[toolName] ||
				(skillModule.default && typeof skillModule.default === "object"
					? skillModule.default[toolName]
					: undefined) ||
				(typeof skillModule.default === "function"
					? skillModule.default
					: undefined);

			if (typeof handler !== "function") {
				return {
					success: false,
					error: `Tool function "${toolName}" not found in skill ${skillId}`,
				};
			}

			const result = await handler(input);

			this.emit("executed", { skillId, toolName, input });

			return {
				success: true,
				output: result,
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
	 * 获取 skill 的系统提示词
	 */
	async getSystemPrompt(id: string): Promise<string | null> {
		const skill = this.skills.get(id);
		if (!skill) return null;

		// 优先使用 manifest.systemPrompt 内联值
		if (skill.manifest.systemPrompt) {
			return skill.manifest.systemPrompt;
		}

		// 尝试从 prompts/main.txt 读取
		const promptPath = path.join(skill.path, "prompts", "main.txt");
		try {
			return await fs.readFile(promptPath, "utf-8");
		} catch {
			return null;
		}
	}

	/**
	 * 获取 skill command 的提示词
	 */
	getCommandPrompt(skillId: string, commandName: string): string | null {
		const skill = this.skills.get(skillId);
		if (!skill) return null;

		const command = skill.manifest.commands?.find(
			(c) => c.name === commandName,
		);
		return command?.prompt ?? null;
	}

	/**
	 * 获取 skill 的所有工具
	 */
	getSkillTools(skillId: string): SkillTool[] {
		return this.skills.get(skillId)?.manifest.tools || [];
	}

	/**
	 * 插件动态注册 Skill
	 */
	registerDynamic(config: DynamicSkillConfig, ownerId: string): void {
		this.skills.set(config.id, config);
		this.dynamicHandlers.set(config.id, config.handlers);
		this.dynamicOwners.set(config.id, ownerId);
		console.log(
			`[SkillService] Dynamic skill registered: ${config.id} (owner: ${ownerId})`,
		);
	}

	/**
	 * 插件停用时清理动态注册的 Skills
	 */
	unregisterDynamic(ownerId: string): void {
		for (const [skillId, owner] of this.dynamicOwners) {
			if (owner === ownerId) {
				this.skills.delete(skillId);
				this.dynamicHandlers.delete(skillId);
				this.dynamicOwners.delete(skillId);
				console.log(
					`[SkillService] Dynamic skill unregistered: ${skillId} (owner: ${ownerId})`,
				);
			}
		}
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
