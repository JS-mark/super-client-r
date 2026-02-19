/**
 * 系统提示词管理模块
 *
 * 架构设计：
 * - 每个能力域（浏览器、知识库等）的提示词独立一个文件，职责单一，便于独立迭代和 review
 * - 本文件作为统一入口，负责导出所有提示词常量，并提供组装函数
 * - 组装函数根据配置按需拼接，业务代码只需一行调用
 *
 * 新增提示词：
 * 1. 在本目录下新建 <能力域>.ts，导出常量
 * 2. 在本文件中导出并在 buildSystemPrompt 中按条件拼接
 */

import { createLogger } from "../services/logService";

export { BROWSER_INSTRUCTIONS } from "./browser";
export { CLEAR_INSTRUCTIONS } from "./clear";
export { KNOWLEDGE_INSTRUCTIONS } from "./knowledge";
export { USER_CONFIG_INSTRUCTIONS } from "./userConfig";

const logger = createLogger("SystemPrompt");

/**
 * 全局默认系统提示词
 *
 * 所有模型调用均携带此提示词，优先级最高，排在模型自定义提示词之前。
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful, harmless, and honest AI assistant. You should:

1. Provide accurate and well-reasoned responses to user questions.
2. If you are unsure about something, clearly state your uncertainty rather than guessing.
3. Follow the user's instructions carefully and respond in the same language as the user's message.
4. When providing code, ensure it is correct, well-structured, and follows best practices.
5. Be concise but thorough — avoid unnecessary verbosity while ensuring completeness.
6. When dealing with sensitive topics, remain objective and balanced.`;

/**
 * 构建完整的系统提示词
 *
 * 拼接顺序：全局默认提示词 → 模型自定义提示词
 * 全局提示词始终在最前面，不可被模型自定义提示词覆盖。
 *
 * @param modelSystemPrompt - 模型配置中的自定义系统提示词（可选）
 * @returns 拼接后的完整系统提示词
 */
export function buildSystemPrompt(modelSystemPrompt?: string): string {
	const parts: string[] = [DEFAULT_SYSTEM_PROMPT];

	if (modelSystemPrompt?.trim()) {
		parts.push(modelSystemPrompt.trim());
	}

	const result = parts.join("\n\n");

	logger.debug("Built system prompt", {
		hasModelPrompt: !!modelSystemPrompt?.trim(),
		totalLength: result.length,
	});

	return result;
}
