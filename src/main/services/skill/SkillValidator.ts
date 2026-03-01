/**
 * Skill 校验模块
 * 以 Claude Code 规范（SKILL.md + plugin.json + commands/*.md）为唯一校验路径
 *
 * 校验层级：
 *   L1 结构校验（error 阻断）
 *   L2 内容校验（error 阻断）
 *   L3 一致性校验（warning）
 *   L4 安全校验（error 阻断，始终执行）
 */

import fs from "node:fs/promises";
import path from "node:path";
import type {
	SkillManifest,
	SkillType,
	SkillValidationResult,
	ValidationCategory,
	ValidationIssue,
	ValidationSeverity,
} from "../../ipc/types";

// ============ 常量 ============

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
const JS_IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DEPTH = 5;

const DANGEROUS_FILES = new Set([
	".env",
	".env.local",
	".env.production",
	".env.development",
	"credentials.json",
	"credentials.yaml",
	"credentials.yml",
	".npmrc",
	".pypirc",
	"id_rsa",
	"id_ed25519",
	".ssh",
]);

const DANGEROUS_EXTENSIONS = new Set([
	".exe",
	".bat",
	".cmd",
	".com",
	".scr",
	".pif",
	".msi",
	".dll",
	".sys",
	".drv",
]);

const SKIP_DIRS = new Set(["node_modules", ".git"]);

const ALLOWED_TOOLS = new Set([
	"Read",
	"Write",
	"Edit",
	"Bash",
	"Glob",
	"Grep",
	"WebSearch",
	"WebFetch",
	"AskUserQuestion",
]);

// ============ SKILL.md Frontmatter 解析 ============

interface PluginJson {
	name: string;
	description: string;
	version: string;
	author: { name: string };
	icon?: string;
	category?: string;
	displayName?: string;
	tools?: SkillManifest["tools"];
}

/**
 * 轻量级 YAML frontmatter 解析器
 * 支持：简单 key: value、`|` 多行文本、字符串值（带/不带引号）
 */
function parseFrontmatter(
	content: string,
): { data: Record<string, string>; body: string } | null {
	const trimmed = content.trimStart();
	if (!trimmed.startsWith("---")) return null;

	const secondDash = trimmed.indexOf("---", 3);
	if (secondDash === -1) return null;

	const yamlBlock = trimmed.slice(3, secondDash).trim();
	const body = trimmed.slice(secondDash + 3).trim();
	const data: Record<string, string> = {};

	const lines = yamlBlock.split("\n");
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const match = line.match(/^(\S[\w-]*)\s*:\s*(.*)/);
		if (match) {
			const key = match[1];
			let value = match[2].trim();

			if (value === "|" || value === "|+") {
				// 多行文本：收集后续缩进行
				const multiLines: string[] = [];
				i++;
				while (i < lines.length && /^\s+/.test(lines[i])) {
					multiLines.push(lines[i].replace(/^\s+/, ""));
					i++;
				}
				data[key] = multiLines.join("\n");
				continue;
			}

			// 去除引号
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			data[key] = value;
		}
		i++;
	}

	return { data, body };
}

// ============ 工具函数 ============

function issue(
	code: string,
	severity: ValidationSeverity,
	category: ValidationCategory,
	fallbackMessage: string,
	messageParams?: Record<string, string | number>,
): ValidationIssue {
	return {
		code,
		severity,
		category,
		messageKey: `skills.validation.${code}`,
		messageParams,
		fallbackMessage,
	};
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * 发现 skill 目录中的 SKILL.md 路径
 * 支持两种布局：
 *   1. skills/<id>/SKILL.md（标准 Claude Code 布局）
 *   2. <root>/SKILL.md（直接存在于根目录）
 */
async function findSkillMd(
	sourcePath: string,
): Promise<{ skillMdPath: string; skillId: string } | null> {
	// 1. 查找 skills/*/SKILL.md 模式
	const skillsDir = path.join(sourcePath, "skills");
	try {
		const entries = await fs.readdir(skillsDir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isDirectory()) {
				const candidate = path.join(
					skillsDir,
					String(entry.name),
					"SKILL.md",
				);
				if (await fileExists(candidate)) {
					return { skillMdPath: candidate, skillId: String(entry.name) };
				}
			}
		}
	} catch {
		// skills dir doesn't exist
	}

	// 2. 根目录直接存在 SKILL.md
	const rootSkillMd = path.join(sourcePath, "SKILL.md");
	if (await fileExists(rootSkillMd)) {
		return { skillMdPath: rootSkillMd, skillId: path.basename(sourcePath) };
	}

	return null;
}

/**
 * 查找 plugin.json 的路径
 * 支持 .claude-plugin/plugin.json
 */
function getPluginJsonPath(sourcePath: string): string {
	return path.join(sourcePath, ".claude-plugin", "plugin.json");
}

/**
 * 查找 commands 目录
 * 支持 skills/<id>/commands/ 或根目录 commands/
 */
async function findCommandsDir(
	sourcePath: string,
	skillId: string,
): Promise<string | null> {
	const candidates = [
		path.join(sourcePath, "skills", skillId, "commands"),
		path.join(sourcePath, "commands"),
	];
	for (const dir of candidates) {
		if (await fileExists(dir)) return dir;
	}
	return null;
}

// ============ L1: 结构校验 ============

interface StructuralResult {
	issues: ValidationIssue[];
	manifest: SkillManifest | null;
	skillType: SkillType;
	skillMdData?: Record<string, string>;
	skillMdBody?: string;
	pluginJson?: PluginJson;
}

/**
 * Claude Code 模式结构校验：SKILL.md + plugin.json
 */
async function validateClaudeCodeStructural(
	sourcePath: string,
	skillMdPath: string,
	skillId: string,
	installedSkillIds: string[],
): Promise<StructuralResult> {
	const issues: ValidationIssue[] = [];

	// --- SKILL.md 解析 ---
	let content: string;
	try {
		content = await fs.readFile(skillMdPath, "utf-8");
	} catch {
		issues.push(
			issue(
				"SKILLMD_MISSING",
				"error",
				"structural",
				`SKILL.md not found at ${skillMdPath}`,
			),
		);
		return { issues, manifest: null, skillType: "claude-code" };
	}

	const parsed = parseFrontmatter(content);
	if (!parsed) {
		issues.push(
			issue(
				"SKILLMD_NO_FRONTMATTER",
				"error",
				"structural",
				"SKILL.md does not have a valid YAML frontmatter (must start with ---)",
			),
		);
		return { issues, manifest: null, skillType: "claude-code" };
	}

	const { data: fmData, body: fmBody } = parsed;

	// name 字段
	if (!fmData.name || fmData.name.trim() === "") {
		issues.push(
			issue(
				"SKILLMD_MISSING_NAME",
				"error",
				"structural",
				"SKILL.md frontmatter is missing \"name\" field",
			),
		);
	} else {
		if (!KEBAB_CASE.test(fmData.name)) {
			issues.push(
				issue(
					"SKILLMD_NAME_NOT_KEBAB",
					"error",
					"structural",
					`SKILL.md name "${fmData.name}" must be kebab-case`,
					{ name: fmData.name },
				),
			);
		}
		if (fmData.name.length > 50) {
			issues.push(
				issue(
					"ID_TOO_LONG",
					"error",
					"structural",
					`Skill name must be 50 characters or less, got ${fmData.name.length}`,
					{ length: fmData.name.length },
				),
			);
		}
	}

	// description 字段
	if (!fmData.description || fmData.description.trim() === "") {
		issues.push(
			issue(
				"SKILLMD_MISSING_DESCRIPTION",
				"error",
				"structural",
				"SKILL.md frontmatter is missing \"description\" field",
			),
		);
	}

	// allowed-tools 字段
	if (!fmData["allowed-tools"] || fmData["allowed-tools"].trim() === "") {
		issues.push(
			issue(
				"SKILLMD_MISSING_TOOLS",
				"error",
				"structural",
				"SKILL.md frontmatter is missing \"allowed-tools\" field",
			),
		);
	} else {
		const tools = fmData["allowed-tools"]
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		for (const tool of tools) {
			if (!ALLOWED_TOOLS.has(tool)) {
				issues.push(
					issue(
						"SKILLMD_INVALID_TOOL",
						"warning",
						"structural",
						`Tool "${tool}" is not in the allowed tools whitelist`,
						{ tool },
					),
				);
			}
		}
	}

	// --- plugin.json 解析 ---
	const pluginJsonPath = getPluginJsonPath(sourcePath);
	let pluginJson: PluginJson | undefined;

	if (!(await fileExists(pluginJsonPath))) {
		issues.push(
			issue(
				"PLUGIN_JSON_MISSING",
				"error",
				"structural",
				"Missing .claude-plugin/plugin.json",
			),
		);
	} else {
		try {
			const raw = await fs.readFile(pluginJsonPath, "utf-8");
			const pj = JSON.parse(raw);

			if (!pj || typeof pj !== "object" || Array.isArray(pj)) {
				issues.push(
					issue(
						"PLUGIN_JSON_INVALID",
						"error",
						"structural",
						"plugin.json must be a JSON object",
					),
				);
			} else {
				// 必填字段
				const missing: string[] = [];
				if (!pj.name || typeof pj.name !== "string") missing.push("name");
				if (!pj.description || typeof pj.description !== "string")
					missing.push("description");
				if (!pj.version || typeof pj.version !== "string")
					missing.push("version");
				if (
					!pj.author ||
					typeof pj.author !== "object" ||
					typeof pj.author?.name !== "string"
				)
					missing.push("author.name");

				for (const field of missing) {
					issues.push(
						issue(
							"PLUGIN_JSON_FIELD_MISSING",
							"error",
							"structural",
							`plugin.json is missing required field "${field}"`,
							{ field },
						),
					);
				}

				if (missing.length === 0) {
					pluginJson = pj as PluginJson;

					// version semver 检查
					if (!SEMVER.test(pluginJson.version)) {
						issues.push(
							issue(
								"PLUGIN_VERSION_NOT_SEMVER",
								"error",
								"structural",
								`plugin.json version "${pluginJson.version}" is not valid semver`,
								{ version: pluginJson.version },
							),
						);
					}
				}
			}
		} catch {
			issues.push(
				issue(
					"PLUGIN_JSON_INVALID",
					"error",
					"structural",
					"plugin.json is not valid JSON",
				),
			);
		}
	}

	// --- id 冲突 ---
	const id = fmData.name || skillId;
	if (id && installedSkillIds.includes(id)) {
		issues.push(
			issue("ID_CONFLICT", "error", "structural", `Skill "${id}" is already installed`, {
				id,
			}),
		);
	}

	// --- 构建 manifest（合并元数据） ---
	const hasErrors = issues.some((i) => i.severity === "error");
	if (hasErrors) {
		return {
			issues,
			manifest: null,
			skillType: "claude-code",
			skillMdData: fmData,
			skillMdBody: fmBody,
			pluginJson,
		};
	}

	const manifest: SkillManifest = {
		id: fmData.name,
		name: pluginJson?.displayName ?? pluginJson?.description ?? fmData.name,
		description: pluginJson?.description ?? fmData.description,
		version: pluginJson?.version ?? "0.0.0",
		author: pluginJson?.author.name ?? "unknown",
		category: pluginJson?.category,
		icon: pluginJson?.icon,
		tools: pluginJson?.tools,
	};

	return {
		issues,
		manifest,
		skillType: "claude-code",
		skillMdData: fmData,
		skillMdBody: fmBody,
		pluginJson,
	};
}

// ============ L2: 内容校验 ============

async function validateContent(
	sourcePath: string,
	skillType: SkillType,
	manifest: SkillManifest,
	skillId: string,
): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];

	// --- commands/*.md 校验 ---
	{
		const commandsDir = await findCommandsDir(sourcePath, skillId);
		if (commandsDir) {
			try {
				const entries = await fs.readdir(commandsDir, { withFileTypes: true });
				for (const entry of entries) {
					const name = String(entry.name);
					if (entry.isFile() && name.endsWith(".md")) {
						const content = await fs.readFile(path.join(commandsDir, name), "utf-8");
						const parsed = parseFrontmatter(content);

						if (!parsed) {
							issues.push(
								issue(
									"COMMAND_NO_FRONTMATTER",
									"error",
									"content",
									`commands/${name} is missing frontmatter header`,
									{ file: name },
								),
							);
							continue;
						}

						if (
							!parsed.data.description ||
							parsed.data.description.trim() === ""
						) {
							issues.push(
								issue(
									"COMMAND_MISSING_DESCRIPTION",
									"error",
									"content",
									`commands/${name} frontmatter is missing "description"`,
									{ file: name },
								),
							);
						}

						if (
							!parsed.data["allowed-tools"] ||
							parsed.data["allowed-tools"].trim() === ""
						) {
							issues.push(
								issue(
									"COMMAND_MISSING_TOOLS",
									"error",
									"content",
									`commands/${name} frontmatter is missing "allowed-tools"`,
									{ file: name },
								),
							);
						}

						// 命令体 XML 包裹检查（warning）
						const cmdName = name.replace(/\.md$/, "");
						if (
							parsed.body &&
							!parsed.body.includes(`<${cmdName}`) &&
							!parsed.body.includes(`<${cmdName}>`)
						) {
							issues.push(
								issue(
									"COMMAND_NO_XML_WRAPPER",
									"warning",
									"content",
									`commands/${name} body is not wrapped in <${cmdName}>...</${cmdName}> tags`,
									{ file: name, command: cmdName },
								),
							);
						}
					}
				}
			} catch {
				// commands dir read error
			}
		}
	}

	// --- plugin.json tools 校验（如存在） ---
	const tools = manifest.tools;
	if (tools && Array.isArray(tools) && tools.length > 0) {
		for (let i = 0; i < tools.length; i++) {
			const tool = tools[i];

			if (!tool.name || typeof tool.name !== "string") {
				issues.push(
					issue("TOOL_MISSING_NAME", "error", "content", `tools[${i}] is missing "name"`, {
						index: i,
					}),
				);
			} else if (!JS_IDENTIFIER.test(tool.name)) {
				issues.push(
					issue(
						"TOOL_INVALID_NAME",
						"error",
						"content",
						`Tool name "${tool.name}" is not a valid JavaScript identifier`,
						{ name: tool.name },
					),
				);
			}

			if (!tool.description || typeof tool.description !== "string") {
				issues.push(
					issue(
						"TOOL_MISSING_DESCRIPTION",
						"error",
						"content",
						`tools[${i}] is missing "description"`,
						{ index: i },
					),
				);
			}

			if (
				!tool.inputSchema ||
				typeof tool.inputSchema !== "object" ||
				Array.isArray(tool.inputSchema)
			) {
				issues.push(
					issue(
						"TOOL_MISSING_SCHEMA",
						"error",
						"content",
						`tools[${i}] is missing "inputSchema"`,
						{ index: i },
					),
				);
			} else if (!("type" in tool.inputSchema)) {
				issues.push(
					issue(
						"TOOL_SCHEMA_NO_TYPE",
						"error",
						"content",
						`tools[${i}].inputSchema must have a "type" field`,
						{ index: i },
					),
				);
			}
		}

		// 声明了 tools 则必须有实现文件
		const implCandidates = [
			path.join(sourcePath, "index.js"),
			path.join(sourcePath, "index.ts"),
			path.join(sourcePath, "scripts", "index.js"),
			path.join(sourcePath, "scripts", "index.ts"),
		];

		let hasImpl = false;
		for (const p of implCandidates) {
			if (await fileExists(p)) {
				hasImpl = true;
				break;
			}
		}

		if (!hasImpl) {
			issues.push(
				issue(
					"TOOLS_NO_IMPLEMENTATION",
					"error",
					"content",
					"Skill declares tools but has no implementation file (index.js/ts or scripts/index.js/ts)",
				),
			);
		}
	}

	return issues;
}

// ============ L3: 一致性校验 ============

async function validateConsistency(
	sourcePath: string,
	_skillType: SkillType,
	skillId: string,
	skillMdData?: Record<string, string>,
	pluginJson?: PluginJson,
): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];

	// name 一致性：SKILL.md name vs plugin.json name vs 目录名
	if (skillMdData?.name && pluginJson?.name) {
		if (skillMdData.name !== pluginJson.name) {
			issues.push(
				issue(
					"NAME_MISMATCH",
					"warning",
					"consistency",
					`SKILL.md name "${skillMdData.name}" differs from plugin.json name "${pluginJson.name}"`,
					{ skillMdName: skillMdData.name, pluginName: pluginJson.name },
				),
			);
		}
	}

	// 目录名与 SKILL.md name 一致性
	if (skillMdData?.name && skillId !== skillMdData.name) {
		issues.push(
			issue(
				"NAME_MISMATCH",
				"warning",
				"consistency",
				`Directory name "${skillId}" differs from SKILL.md name "${skillMdData.name}"`,
				{ dirName: skillId, skillMdName: skillMdData.name },
			),
		);
	}

	// 缺少 prompts/main.txt
	const promptPath = path.join(sourcePath, "prompts", "main.txt");
	if (!(await fileExists(promptPath))) {
		issues.push(
			issue(
				"NO_SYSTEM_PROMPT",
				"warning",
				"consistency",
				"No prompts/main.txt — App chat integration has no system prompt",
			),
		);
	}

	// 缺少 commands/ 目录
	const commandsDir = await findCommandsDir(sourcePath, skillId);
	if (!commandsDir) {
		issues.push(
			issue(
				"NO_COMMANDS",
				"warning",
				"consistency",
				"No commands/ directory — no slash commands available",
			),
		);
	}

	// 缺少 README.md
	const readmePath = path.join(sourcePath, "README.md");
	const readmeAltPath = path.join(sourcePath, "Readme.md");
	if (!(await fileExists(readmePath)) && !(await fileExists(readmeAltPath))) {
		issues.push(
			issue("NO_README", "warning", "consistency", "No README.md found"),
		);
	}

	return issues;
}

// ============ L4: 安全校验（不变） ============

async function validateSecurity(sourcePath: string): Promise<ValidationIssue[]> {
	const issues: ValidationIssue[] = [];
	let totalSize = 0;

	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > MAX_DEPTH) {
			issues.push(
				issue(
					"DIR_TOO_DEEP",
					"error",
					"security",
					`Directory depth exceeds ${MAX_DEPTH} levels`,
					{ maxDepth: MAX_DEPTH },
				),
			);
			return;
		}

		let entries: import("node:fs").Dirent[];
		try {
			entries = await fs.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const name = String(entry.name);
			const fullPath = path.join(dir, name);
			const relativePath = path.relative(sourcePath, fullPath);

			if (SKIP_DIRS.has(name)) continue;

			if (entry.isSymbolicLink()) {
				try {
					const realPath = await fs.realpath(fullPath);
					const resolvedSource = await fs.realpath(sourcePath);
					if (
						!realPath.startsWith(resolvedSource + path.sep) &&
						realPath !== resolvedSource
					) {
						issues.push(
							issue(
								"SYMLINK_ESCAPE",
								"error",
								"security",
								`Symlink "${relativePath}" points outside skill directory`,
								{ file: relativePath },
							),
						);
					}
				} catch {
					issues.push(
						issue(
							"SYMLINK_BROKEN",
							"error",
							"security",
							`Symlink "${relativePath}" is broken`,
							{ file: relativePath },
						),
					);
				}
				continue;
			}

			if (entry.isDirectory()) {
				await walk(fullPath, depth + 1);
				continue;
			}

			if (entry.isFile()) {
				const lowerName = name.toLowerCase();
				if (DANGEROUS_FILES.has(lowerName)) {
					issues.push(
						issue(
							"DANGEROUS_FILE",
							"error",
							"security",
							`Dangerous file "${relativePath}" found (credentials / secrets)`,
							{ file: relativePath },
						),
					);
				}

				const ext = path.extname(lowerName);
				if (DANGEROUS_EXTENSIONS.has(ext)) {
					issues.push(
						issue(
							"EXECUTABLE_FILE",
							"error",
							"security",
							`Executable file "${relativePath}" is not allowed`,
							{ file: relativePath },
						),
					);
				}

				try {
					const stat = await fs.stat(fullPath);
					if (stat.size > MAX_FILE_SIZE) {
						issues.push(
							issue(
								"FILE_TOO_LARGE",
								"error",
								"security",
								`File "${relativePath}" exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
								{ file: relativePath, size: stat.size, maxSize: MAX_FILE_SIZE },
							),
						);
					}
					totalSize += stat.size;
				} catch {
					// stat failed, skip
				}
			}
		}
	}

	await walk(sourcePath, 0);

	if (totalSize > MAX_TOTAL_SIZE) {
		issues.push(
			issue(
				"TOTAL_SIZE_EXCEEDED",
				"error",
				"security",
				`Total skill size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds ${MAX_TOTAL_SIZE / 1024 / 1024}MB limit`,
				{ totalSize, maxSize: MAX_TOTAL_SIZE },
			),
		);
	}

	return issues;
}

// ============ 入口 ============

/**
 * 执行完整的 skill 校验
 *
 * 校验流程：
 * 1. 目录发现：查找 SKILL.md（Claude Code 模式）
 * 2. L1 结构校验
 * 3. L4 安全校验（始终执行）
 * 4. L2 内容校验（需要结构校验通过）
 * 5. L3 一致性校验（warning）
 */
export async function validateSkill(
	sourcePath: string,
	installedSkillIds: string[],
): Promise<SkillValidationResult> {
	const allIssues: ValidationIssue[] = [];

	// 1. 目录发现（仅支持 SKILL.md）
	const skillMdInfo = await findSkillMd(sourcePath);

	if (!skillMdInfo) {
		allIssues.push(
			issue(
				"NO_SKILL_ENTRY",
				"error",
				"structural",
				"No SKILL.md found — not a valid skill directory",
			),
		);

		const securityIssues = await validateSecurity(sourcePath);
		allIssues.push(...securityIssues);

		const errorCount = allIssues.filter((i) => i.severity === "error").length;
		const warningCount = allIssues.filter((i) => i.severity === "warning").length;
		return {
			valid: false,
			issues: allIssues,
			errorCount,
			warningCount,
			manifest: null,
			skillType: "claude-code",
		};
	}

	// 2. L1 结构校验
	const structural = await validateClaudeCodeStructural(
		sourcePath,
		skillMdInfo.skillMdPath,
		skillMdInfo.skillId,
		installedSkillIds,
	);

	allIssues.push(...structural.issues);

	// 3. L4 安全校验（始终执行）
	const securityIssues = await validateSecurity(sourcePath);
	allIssues.push(...securityIssues);

	// 4. L2 & L3 需要 manifest
	if (structural.manifest) {
		const skillId = skillMdInfo.skillId;

		const contentIssues = await validateContent(
			sourcePath,
			structural.skillType,
			structural.manifest,
			skillId,
		);
		allIssues.push(...contentIssues);

		const consistencyIssues = await validateConsistency(
			sourcePath,
			structural.skillType,
			skillId,
			structural.skillMdData,
			structural.pluginJson,
		);
		allIssues.push(...consistencyIssues);
	}

	const errorCount = allIssues.filter((i) => i.severity === "error").length;
	const warningCount = allIssues.filter((i) => i.severity === "warning").length;

	return {
		valid: errorCount === 0,
		issues: allIssues,
		errorCount,
		warningCount,
		manifest: errorCount === 0 ? structural.manifest : null,
		skillType: structural.skillType,
	};
}
