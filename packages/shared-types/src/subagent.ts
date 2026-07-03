/**
 * Phase 4 Multi-Agent 子代理相关的纯类型定义。
 *
 * Round 6 引入子代理运行时（parent Agent 通过内置 `Task` 工具触发；见
 * multi-agent 设计 §4）。跨 IPC / renderer / storage / product-event
 * 都共享同一个 `SubagentRunSummary` 形状，作为父转录里可折叠的
 * `SubagentMessagePart` 的运行时快照。
 *
 * 独立文件而非塞进 chat.ts 是为了：
 *  - 避免 chat.ts 继续膨胀
 *  - 让 agent-product-events.ts / project.ts / storage 从一个小型 module
 *    单独 import，减少循环引用面
 */

export type SubagentTaskStatus =
	| "spawned"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

/**
 * 子代理运行汇总，driver：
 *  - `parentRunId` 主 Agent 的 requestId / runId，配合 `subagentRunId`
 *    构成父子事件树的连接。
 *  - `parentAssistantMessageId` 指向 SubagentMessagePart 挂载的父
 *    assistant message，用于父转录里的折叠卡片替代直接展开子会话工具链。
 *  - `taskGoal` `Task` 工具入参 goal 的短摘要（renderer 直接展示，长度截断
 *    交由生产端处理）。
 *  - `summary` 完整最终 assistant 文本的短摘要；`resultRef` 指向 storage
 *    externalize 后的 contentRef（大结果不塞进 UI 内存）。
 */
export interface SubagentRunSummary {
	subagentRunId: string;
	parentRunId: string;
	parentAssistantMessageId?: string;
	/** `AgentProfile.id` 当已知 */
	profileId?: string;
	profileName?: string;
	/** `Task` 输入 goal 的截断摘要 */
	taskGoal: string;
	status: SubagentTaskStatus;
	startedAt: number;
	endedAt?: number;
	tokenUsage?: {
		input?: number;
		output?: number;
	};
	toolCallCount?: number;
	/** 仅在 `status === "failed"` 时填充 */
	errorMessage?: string;
	/** 最终 assistant 文本摘要（截断） */
	summary?: string;
	/** externalize 后的完整结果 contentRef */
	resultRef?: string;
}
