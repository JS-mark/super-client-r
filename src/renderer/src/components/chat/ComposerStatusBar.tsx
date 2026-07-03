import { Popover, Segmented, Space, Tag, Tooltip } from "antd";
import { useEffectiveModel } from "../../hooks/useEffectiveModel";
import { useEffectiveInteractionProfile } from "../../hooks/useEffectiveInteractionProfile";
import {
	AGENT_COMPOSER_MODE_DESCRIPTION,
	AGENT_COMPOSER_MODE_LABEL,
	type AgentComposerMode,
	toAgentComposerMode,
	toPlanModeFromAgentComposerMode,
} from "../../lib/planModePresentation";
import {
	getProjectIdFromConversation,
	useChatStore,
} from "../../stores/chatStore";
import { useChatMessageStore } from "../../stores/chatMessageStore";
import { useProjectSettings } from "../../stores/projectStore";
import type { ActiveModelSelection } from "../../types/models";
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
 * open `ChatModelPicker`.
 */
interface ComposerStatusBarProps {
	messageModelOverride?: ActiveModelSelection | null;
}

export function ComposerStatusBar({
	messageModelOverride,
}: ComposerStatusBarProps = {}) {
	const currentConversation = useChatStore((s) =>
		s.conversations.find((c) => c.id === s.currentConversationId),
	);
	const currentConversationId = useChatStore((s) => s.currentConversationId);
	const isStreaming = useChatMessageStore((s) => s.isStreaming);
	const updateConversationMetadata = useChatStore(
		(s) => s.updateConversationMetadata,
	);
	const projectSettings = useProjectSettings(
		getProjectIdFromConversation(currentConversation),
	);
	const interactionProfile: InteractionProfile =
		useEffectiveInteractionProfile();
	const effectiveModel = useEffectiveModel(messageModelOverride);

	if (!currentConversation) {
		return null;
	}

	const planMode: PlanMode = currentConversation.session?.planMode ?? "chat";
	const composerMode = toAgentComposerMode(planMode);
	const planModeDisabled = isStreaming || !currentConversationId;

	const handlePlanModeChange = (next: AgentComposerMode) => {
		const nextPlanMode = toPlanModeFromAgentComposerMode(next);
		if (
			planModeDisabled ||
			next === composerMode ||
			nextPlanMode === planMode ||
			!currentConversationId
		) {
			return;
		}
		void updateConversationMetadata(currentConversationId, {
			session: { planMode: nextPlanMode },
		});
	};

	const planModePopoverContent = (
		<div className="flex w-[260px] flex-col gap-3">
			<Segmented
				block
				value={composerMode}
				onChange={(value) => handlePlanModeChange(value as AgentComposerMode)}
				options={[
					{ label: AGENT_COMPOSER_MODE_LABEL.plan, value: "plan" },
					{ label: AGENT_COMPOSER_MODE_LABEL.execute, value: "execute" },
				]}
				disabled={planModeDisabled}
			/>
			<div className="space-y-2 text-xs text-gray-500">
				<div>
					<span className="font-medium text-gray-700">Plan</span>
					<span className="ml-2">{AGENT_COMPOSER_MODE_DESCRIPTION.plan}</span>
				</div>
				<div>
					<span className="font-medium text-gray-700">Execute</span>
					<span className="ml-2">
						{AGENT_COMPOSER_MODE_DESCRIPTION.execute}
					</span>
				</div>
			</div>
		</div>
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
				title="Agent Mode"
				trigger="click"
				placement="top"
			>
				<Tag
					className={`m-0 text-xs ${
						planModeDisabled ? "opacity-60" : "cursor-pointer"
					}`}
				>
					Mode: {AGENT_COMPOSER_MODE_LABEL[composerMode]}
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
					Context:{" "}
					{attachmentMode ? ATTACHMENT_MODE_LABEL[attachmentMode] : "—"}
				</Tag>
			</Tooltip>

			<Tooltip
				title={
					effectiveModel
						? `${effectiveModel.provider.name} · ${
								effectiveModel.model.name || effectiveModel.model.id
							}`
						: "未解析模型"
				}
			>
				<Tag className="m-0 text-xs">
					Model: {effectiveModel?.sourceLabel ?? "—"}
				</Tag>
			</Tooltip>
		</Space>
	);
}
