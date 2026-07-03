import type { Message } from "@super-client/shared-types/chat";
import type { PlanCard as PlanCardData } from "@super-client/shared-types/plan-execute";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatInputArea } from "../ChatInputArea";

vi.mock("@ant-design/icons", () => ({
	CheckOutlined: () => <span aria-hidden="true" />,
	CloseOutlined: () => <span aria-hidden="true" />,
	DeleteOutlined: () => <span aria-hidden="true" />,
	PauseCircleOutlined: () => <span aria-hidden="true" />,
	PlusOutlined: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
	SearchOutlined: () => <span aria-hidden="true" />,
	ThunderboltOutlined: () => <span aria-hidden="true" />,
}));

vi.mock("antd", () => {
	function Button({
		icon,
		children,
		disabled,
		onClick,
		"aria-label": ariaLabel,
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		icon?: React.ReactNode;
	}) {
		return (
			<button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
				{icon}
				{children}
			</button>
		);
	}

	const Input = Object.assign(
		function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
			return <input {...props} />;
		},
		{
			TextArea(
				props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
					autoSize?: unknown;
				},
			) {
				const { autoSize: _autoSize, ...rest } = props;
				return <textarea {...rest} />;
			},
		},
	);

	function PassThrough({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}

	return {
		App: {
			useApp: () => ({
				message: {
					error: vi.fn(),
				},
			}),
		},
		Button,
		Flex: PassThrough,
		Input,
		Tag: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
		Tooltip: PassThrough,
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorBorderSecondary: "#eee",
					colorFillQuaternary: "#f7f7f7",
					colorText: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
				},
			}),
		},
	};
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (
			key: string,
			defaultValueOrOptions?: string | { defaultValue?: string },
		) =>
			typeof defaultValueOrOptions === "string"
				? defaultValueOrOptions
				: (defaultValueOrOptions?.defaultValue ?? key),
	}),
}));

let chatMessages: Message[] = [];
let composerValue = "";

vi.mock("../../../stores/chatMessageStore", () => ({
	useChatMessageStore: (selector: (state: { messages: Message[] }) => unknown) =>
		selector({ messages: chatMessages }),
}));

vi.mock("../../../stores/chatInputStore", () => ({
	useChatInputStore: (
		selector: (state: {
			value: string;
			setValue: (value: string) => void;
		}) => unknown,
	) =>
		selector({
			value: composerValue,
			setValue: (value: string) => {
				composerValue = value;
			},
		}),
}));

vi.mock("../../../stores/chatStore", () => ({
	getProjectIdFromConversation: () => undefined,
	useChatStore: (
		selector: (state: {
			conversations: Array<{ id: string; name: string }>;
		}) => unknown,
	) =>
		selector({
			conversations: [{ id: "conversation-1", name: "Conversation" }],
		}),
}));

vi.mock("../../../stores/projectStore", () => ({
	useProjectSettings: () => ({
		runtimePolicy: { approvalMode: "request" },
	}),
	useProjectStore: (
		selector: (state: {
			projects: Array<{ id: string; name: string }>;
		}) => unknown,
	) => selector({ projects: [] }),
}));

vi.mock("../../../stores/attachmentStore", () => ({
	useAttachmentStore: {
		getState: () => ({ addAttachment: vi.fn() }),
	},
}));

vi.mock("../../../stores/shortcutStore", () => ({
	getShortcutFromEvent: () => "",
	normalizeShortcut: (value: string) => value,
	useShortcutStore: {
		getState: () => ({ getShortcut: () => undefined }),
	},
}));

vi.mock("../../../hooks/useEffectiveModel", () => ({
	useEffectiveModel: () => null,
}));

vi.mock("../../../hooks/useAtMentions", () => ({
	applyMentionToValue: (value: string) => ({ value, caret: value.length }),
}));

vi.mock("../../attachment", () => ({
	AttachmentList: () => <div>Attachments</div>,
}));

vi.mock("../AgentTeamSelector", () => ({
	AgentTeamSelector: () => <div>Team</div>,
}));

vi.mock("../composer/ApprovalModePill", () => ({
	ApprovalModePill: () => <div>Approval</div>,
}));

vi.mock("../composer/ChatComposer", () => ({
	ChatComposer: () => <textarea data-testid="ordinary-composer" />,
}));

vi.mock("../composer/ChatComposerInfoBar", () => ({
	ChatComposerInfoBar: () => <div>Info</div>,
}));

vi.mock("../composer/ChatToolsMenu", () => ({
	ChatToolsMenu: () => <div>Tools</div>,
}));

vi.mock("../composer/ContextUsagePill", () => ({
	ContextUsagePill: () => <div>Context</div>,
}));

vi.mock("../composer/ModelPill", () => ({
	ModelPill: () => <div>Model</div>,
}));

vi.mock("../ComposerStatusBar", () => ({
	ComposerStatusBar: () => <div>Status</div>,
}));

vi.mock("../SearchEnginePanel", () => ({
	SearchEnginePanel: () => <div>Search</div>,
}));

vi.mock("../SlashCommandPanel", () => ({
	SlashCommandPanel: () => <div>Slash</div>,
}));

vi.mock("../MentionPanel", () => ({
	MentionPanel: () => <div>Mention</div>,
}));

vi.mock("../toolbar/PromptTemplatePanel", () => ({
	PromptTemplatePanel: () => <div>Prompt</div>,
}));

vi.mock("../toolbar/QuotePanel", () => ({
	QuotePanel: () => <div>Quote</div>,
}));

vi.mock("../toolbar/ToolsPanel", () => ({
	ToolsPanel: () => <div>Tool panel</div>,
}));

vi.mock("../AskUserQuestionCard", () => ({
	AskUserQuestionCard: () => <div>Question</div>,
}));

vi.mock("../ToolCallCard", () => ({
	ToolCallCard: () => <div>Tool approval</div>,
}));

const plan: PlanCardData = {
	id: "plan-composer-1",
	version: 2,
	sourceTurnId: "turn-plan-composer-1",
	goal: "Approve composer plan",
	summary: "Block ordinary chat input while the plan awaits a decision.",
	steps: [
		{
			id: "step-1",
			title: "Decide plan",
		},
	],
};

let root: Root | undefined;
let container: HTMLDivElement | undefined;

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	if (root) {
		act(() => {
			root?.unmount();
		});
	}
	root = undefined;
	container?.remove();
	container = undefined;
	chatMessages = [];
	composerValue = "";
});

describe("ChatInputArea plan decision composer", () => {
	it("replaces the ordinary composer with a disabled PlanCard without wiring", () => {
		chatMessages = [createPendingPlanMessage()];

		render(<ChatInputArea {...defaultProps()} />);

		expect(
			container?.querySelector('[data-testid="ordinary-composer"]'),
		).toBeNull();
		expect(container?.textContent).toContain("Approve composer plan");
		expect(getButton("Execute").disabled).toBe(true);
	});

	it("submits typed plan decisions when a handler is provided", () => {
		const onPlanDecision = vi.fn();
		chatMessages = [createPendingPlanMessage()];

		render(
			<ChatInputArea {...defaultProps()} onPlanDecision={onPlanDecision} />,
		);

		act(() => {
			getButton("Execute").click();
		});

		expect(onPlanDecision).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "execute",
				sourcePlanId: "plan-composer-1",
				sourcePlanVersion: 2,
			}),
		);
	});

	it("renders the paused-error recovery region for agent_runtime_create_failed and dismiss restores composer", () => {
		chatMessages = [createPausedErrorMessage()];

		render(<ChatInputArea {...defaultProps()} />);

		expect(
			container?.querySelector('[data-testid="paused-error-composer"]'),
		).not.toBeNull();
		expect(
			container?.querySelector('[data-testid="ordinary-composer"]'),
		).toBeNull();
		expect(container?.textContent).toContain("Recover");
		expect(container?.textContent).toContain("Dismiss");

		act(() => {
			getButton("Dismiss").click();
		});

		expect(
			container?.querySelector('[data-testid="paused-error-composer"]'),
		).toBeNull();
		expect(
			container?.querySelector('[data-testid="ordinary-composer"]'),
		).not.toBeNull();
	});
});

function createPausedErrorMessage(): Message {
	return {
		id: "assistant-paused",
		role: "assistant",
		content: "",
		timestamp: 2000,
		metadata: {
			errorSummary: "Agent runtime unavailable",
			errorContext: {
				preset: "dashscope",
				apiFormat: undefined,
				baseUrl: undefined,
				model: "qwen-test",
				statusCode: undefined,
				endpointUrl: undefined,
				responseBodySnippet: undefined,
				providerErrorCode: "agent_runtime_create_failed",
				providerErrorMessage: "runtime unavailable",
			},
		},
	} as Message;
}

function createPendingPlanMessage(): Message {
	return {
		id: "assistant-plan",
		role: "assistant",
		content: "",
		timestamp: 1000,
		parts: [
			{
				id: "assistant-plan:plan",
				type: "plan",
				state: "requires-approval",
				createdAt: 1000,
				updatedAt: 1000,
				plan,
			},
		] as unknown as Message["parts"],
	};
}

function defaultProps(): React.ComponentProps<typeof ChatInputArea> {
	return {
		onSend: () => {},
		isStreaming: false,
		onStopStream: () => {},
		selectedSkillId: null,
		onClearSkill: () => {},
		selectedEngine: "",
		onSelectEngine: () => {},
		hasSearchEngines: false,
		currentEngine: null,
		conversationId: "conversation-1",
		slashPanelOpen: false,
		slashFilteredItems: [],
		slashHighlight: 0,
		onSlashHighlightChange: () => {},
		onSlashSelect: () => {},
		onSlashPanelClose: () => {},
		onSlashInputChange: () => {},
		registerKeydownHandler: () => () => {},
	};
}

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}

function getButton(label: string): HTMLButtonElement {
	const button = Array.from(container?.querySelectorAll("button") ?? []).find(
		(candidate) => candidate.textContent?.includes(label),
	);
	if (!button) throw new Error(`Button not found: ${label}`);
	return button;
}
