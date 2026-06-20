import { Popover, Radio, Space, Tag, Tooltip } from "antd";
import { useEffectiveInteractionProfile } from "../../hooks/useEffectiveInteractionProfile";
import { useChatStore } from "../../stores/chatStore";
import { useChatMessageStore } from "../../stores/chatMessageStore";
import { useProjectSettings } from "../../stores/projectStore";
import type {
	InteractionProfile,
	PlanMode,
	SandboxMode,
	WorkspaceContextPolicy,
} from "@super-client/shared-types/chat";

const INTERACTION_PROFILE_SHORT: Record<InteractionProfile, string> = {
	"claude-code": "CC",
	codex: "CX",
	hybrid: "HY",
};

const INTERACTION_PROFILE_LABEL: Record<InteractionProfile, string> = {
	"claude-code": "Claude Code · 紧凑命令式",
	codex: "Codex · 任务驱动可检视",
	hybrid: "Hybrid · 平衡默认",
};

const INTERACTION_PROFILE_COLOR: Record<InteractionProfile, string> = {
	"claude-code": "orange",
	codex: "green",
	hybrid: "blue",
};

const PLAN_MODE_LABEL: Record<PlanMode, string> = {
	chat: "对话",
	"plan-only": "仅计划",
	"plan-then-ask": "计划后确认",
	"auto-execute-safe": "自动执行安全步",
	"full-agent": "完全代理",
};

const PLAN_MODE_TOOLTIP: Record<PlanMode, string> = {
	chat: "正常对话，不产生计划。",
	"plan-only": "生成计划但不执行任何步骤。",
	"plan-then-ask": "生成计划后，请求确认再执行。",
	"auto-execute-safe": "自动执行低风险步骤，对高风险步骤请求审批。",
	"full-agent": "按当前审批与沙箱策略推进执行。",
};

const PLAN_MODE_OPTIONS: PlanMode[] = [
	"chat",
	"plan-only",
	"plan-then-ask",
	"auto-execute-safe",
	"full-agent",
];

const SANDBOX_MODE_LABEL: Record<SandboxMode, string> = {
	"read-only": "只读",
	"workspace-write": "工作区写入",
	"system-access": "系统访问",
};

const SANDBOX_MODE_COLOR: Record<SandboxMode, string> = {
	"read-only": "default",
	"workspace-write": "blue",
	"system-access": "orange",
};

const ATTACHMENT_MODE_LABEL: Record<
	WorkspaceContextPolicy["defaultAttachmentMode"],
	string
> = {
	"include-content": "include",
	"reference-only": "ref",
	"ask-before-read": "ask",
	ignore: "ignore",
};

/**
 * Compact status bar shown at the bottom of the chat composer.
 * Displays effective session runtime as chips:
 *   Model · Plan mode · Approval · Sandbox · Context
 *
 * Only the model chip is interactive in this iteration — clicking it dispatches
 * a `chat:open-model-switcher` window event which `Chat.tsx` listens for to
 * open the existing `ModelSwitcherModal`.
 */
export function ComposerStatusBar() {
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const isStreaming = useChatMessageStore((s) => s.isStreaming);
	const updateConversationMetadata = useChatStore(
		(s) => s.updateConversationMetadata,
	);
	// E-3: workspaceId === "default" → 普通对话，无 project，没有项目级覆盖。
	// 其它 workspaceId 视作 projectId（D-1 适配器规则）。
	const projectIdFromConv =
		currentConversation?.workspaceId &&
		currentConversation.workspaceId !== "default"
			? currentConversation.workspaceId
			: null;
	const projectSettings = useProjectSettings(projectIdFromConv);
	const interactionProfile: InteractionProfile =
		useEffectiveInteractionProfile();

	if (!currentConversation) {
		return null;
	}

	const planMode: PlanMode = currentConversation.session?.planMode ?? "chat";
	const planModeDisabled = isStreaming || !currentConversationId;

	const handlePlanModeChange = (next: PlanMode) => {
		if (planModeDisabled || next === planMode || !currentConversationId) {
			return;
		}
		void updateConversationMetadata(currentConversationId, {
			session: { planMode: next },
		});
	};

	const planModePopoverContent = (
		<Radio.Group
			value={planMode}
			onChange={(e) => handlePlanModeChange(e.target.value as PlanMode)}
			disabled={planModeDisabled}
		>
			<Space direction="vertical" size={4}>
				{PLAN_MODE_OPTIONS.map((mode) => (
					<Radio key={mode} value={mode} className="!items-start">
						<div className="flex flex-col leading-tight">
							<span className="text-xs">
								<code className="text-[11px] opacity-70">{mode}</code>
								<span className="ml-2">{PLAN_MODE_LABEL[mode]}</span>
							</span>
							<span className="text-[11px] opacity-60">
								{PLAN_MODE_TOOLTIP[mode]}
							</span>
						</div>
					</Radio>
				))}
			</Space>
		</Radio.Group>
	);
	const sandboxMode = projectSettings?.runtimePolicy?.sandboxMode;
	const attachmentMode = projectSettings?.contextPolicy?.defaultAttachmentMode;

	return (
		<Space size={4} wrap className="text-xs">
			<Tooltip
				title={`交互画像：${INTERACTION_PROFILE_LABEL[interactionProfile]}`}
			>
				<Tag
					color={INTERACTION_PROFILE_COLOR[interactionProfile]}
					className="m-0 text-xs"
				>
					{INTERACTION_PROFILE_SHORT[interactionProfile]}
				</Tag>
			</Tooltip>

			<Popover
				content={planModePopoverContent}
				title="Plan 模式"
				trigger="click"
				placement="top"
			>
				<Tag
					className={`m-0 text-xs ${
						planModeDisabled ? "opacity-60" : "cursor-pointer"
					}`}
				>
					Plan: {PLAN_MODE_LABEL[planMode]}
				</Tag>
			</Popover>

			<Tooltip title="沙箱模式（来自工作区策略）">
				<Tag
					color={sandboxMode ? SANDBOX_MODE_COLOR[sandboxMode] : "default"}
					className="m-0 text-xs"
				>
					沙箱: {sandboxMode ? SANDBOX_MODE_LABEL[sandboxMode] : "—"}
				</Tag>
			</Tooltip>

			<Tooltip title="附件默认处理方式">
				<Tag className="m-0 text-xs">
					Context: {attachmentMode ? ATTACHMENT_MODE_LABEL[attachmentMode] : "—"}
				</Tag>
			</Tooltip>
		</Space>
	);
}
