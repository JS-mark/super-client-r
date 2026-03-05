/**
 * Skill 相关类型定义
 */

/** Skill 命令 */
export interface SkillCommand {
	name: string;
	skillId: string;
	description: string;
	prompt: string;
	allowedTools?: string[];
}

/** Skill 清单 */
export interface SkillManifest {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	category?: string;
	icon?: string;
	permissions?: string[];
	tools?: SkillTool[];
	systemPrompt?: string;
	commands?: SkillCommand[];
}

/** Skill 工具 */
export interface SkillTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

/** Skill 执行结果 */
export interface SkillExecutionResult {
	success: boolean;
	output?: unknown;
	error?: string;
}

/** 验证严重级别 */
export type ValidationSeverity = "error" | "warning";

/** 验证类别 */
export type ValidationCategory =
	| "structural"
	| "content"
	| "compatibility"
	| "consistency"
	| "security";

/** Skill 类型 */
export type SkillType = "claude-code";

/** 验证问题 */
export interface ValidationIssue {
	code: string;
	severity: ValidationSeverity;
	category: ValidationCategory;
	messageKey: string;
	messageParams?: Record<string, string | number>;
	fallbackMessage: string;
}

/** Skill 验证结果 */
export interface SkillValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
	errorCount: number;
	warningCount: number;
	manifest: SkillManifest | null;
	skillType: SkillType;
}
