import type { Message } from "@super-client/shared-types/chat";
import type { PlanCard as PlanCardData } from "@super-client/shared-types/plan-execute";
import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessageList } from "../ChatMessageList";

vi.mock("@ant-design/icons", () => ({
	ArrowDownOutlined: () => <span aria-hidden="true" />,
	CopyOutlined: () => <span aria-hidden="true" />,
	DeleteOutlined: () => <span aria-hidden="true" />,
	DownloadOutlined: () => <span aria-hidden="true" />,
	EditOutlined: () => <span aria-hidden="true" />,
	HistoryOutlined: () => <span aria-hidden="true" />,
	LoadingOutlined: () => <span aria-hidden="true" />,
	MoreOutlined: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
	RobotOutlined: () => <span aria-hidden="true" />,
	StarFilled: () => <span aria-hidden="true" />,
	StarOutlined: () => <span aria-hidden="true" />,
	UserOutlined: () => <span aria-hidden="true" />,
	CheckOutlined: () => <span aria-hidden="true" />,
	CloseOutlined: () => <span aria-hidden="true" />,
	PlusOutlined: () => <span aria-hidden="true" />,
}));

interface BubbleItem {
	key?: React.Key;
	content?: React.ReactNode;
	contentRender?: () => React.ReactNode;
	header?: React.ReactNode;
	footer?: React.ReactNode;
}

vi.mock("@ant-design/x", async () => {
	const ReactModule = await vi.importActual<typeof React>("react");

	function Bubble({ content, contentRender }: BubbleItem) {
		return <div>{contentRender ? contentRender() : content}</div>;
	}

	Bubble.List = ReactModule.forwardRef<
		{ scrollBoxNativeElement: HTMLDivElement },
		{ items: BubbleItem[] }
	>(function BubbleList({ items }, ref) {
		const scrollEl = ReactModule.useMemo(
			() => document.createElement("div"),
			[],
		);
		ReactModule.useImperativeHandle(
			ref,
			() => ({ scrollBoxNativeElement: scrollEl }),
			[scrollEl],
		);
		return (
			<div>
				{items.map((item) => (
					<div key={item.key}>
						{item.header}
						{item.contentRender ? item.contentRender() : item.content}
						{item.footer}
					</div>
				))}
			</div>
		);
	});

	return { Bubble };
});

vi.mock("react-window", () => ({
	List: ({
		rowComponent: Row,
		rowCount,
		rowProps,
	}: {
		rowComponent: React.ComponentType<
			{
				ariaAttributes: {
					"aria-posinset": number;
					"aria-setsize": number;
					role: "listitem";
				};
				index: number;
				style: React.CSSProperties;
			} & Record<string, unknown>
		>;
		rowCount: number;
		rowProps: Record<string, unknown>;
	}) => (
		<div data-testid="virtual-list" data-row-count={rowCount}>
			{Array.from({ length: Math.min(rowCount, 12) }, (_, index) => (
				<Row
					key={index}
					{...rowProps}
					ariaAttributes={{
						"aria-posinset": index + 1,
						"aria-setsize": rowCount,
						role: "listitem",
					}}
					index={index}
					style={{}}
				/>
			))}
		</div>
	),
	useDynamicRowHeight: () => ({}),
	useListRef: () => ({
		current: {
			element: document.createElement("div"),
			scrollToRow: vi.fn(),
		},
	}),
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
					success: vi.fn(),
					info: vi.fn(),
				},
			}),
		},
		Avatar: PassThrough,
		Button,
		Dropdown: PassThrough,
		Input,
		Spin: () => <div>Loading</div>,
		Tag: ({ children }: { children?: React.ReactNode }) => (
			<span>{children}</span>
		),
		Tooltip: PassThrough,
		theme: {
			useToken: () => ({
				token: {
					colorBgContainer: "#fff",
					colorBorder: "#ddd",
					colorBorderSecondary: "#eee",
					colorFillQuaternary: "#f7f7f7",
					colorPrimary: "#1677ff",
					colorText: "#111",
					colorTextSecondary: "#555",
					colorTextTertiary: "#777",
					colorTextQuaternary: "#999",
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

const chatMessageStoreState = vi.hoisted(() => ({
	isLoadingMessages: false,
	hasOlderMessages: false,
	isLoadingOlderMessages: false,
	streamingContent: "",
}));

vi.mock("../../../stores/chatMessageStore", () => {
	const useChatMessageStore = (
		selector: (state: Record<string, unknown>) => unknown,
	) => selector(chatMessageStoreState);
	useChatMessageStore.getState = () => chatMessageStoreState;
	return { useChatMessageStore };
});

vi.mock("../../../stores/chatStore", () => {
	const useChatStore = () => ({});
	useChatStore.getState = () => ({ loadOlderMessages: vi.fn() });
	return { useChatStore };
});

vi.mock("../../../stores/messageStore", () => ({
	useMessageStore: () => ({
		isBookmarked: () => false,
		addBookmark: vi.fn(),
		removeBookmark: vi.fn(),
		getBookmarkByMessageId: () => undefined,
	}),
}));

vi.mock("../../Markdown", () => ({
	Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("../MessageContextMenu", () => ({
	MessageContextMenu: ({ children }: { children?: React.ReactNode }) => (
		<>{children}</>
	),
}));

vi.mock("../AskUserQuestionCard", () => ({
	AskUserQuestionCard: () => <div>Ask user</div>,
}));

vi.mock("../ErrorCard", () => ({
	ErrorCard: () => <div>Error</div>,
}));

vi.mock("../ThinkingIndicator", () => ({
	ThinkingIndicator: () => <div>Thinking</div>,
}));

vi.mock("../ToolCallCard", () => ({
	ToolCallCard: () => <div>Tool call</div>,
}));

vi.mock("../parts/StreamPartRenderer", () => ({
	StreamPartRenderer: ({
		part,
	}: {
		part: {
			id?: string;
			type: string;
			content?: string;
			label?: string;
			detail?: string;
		};
	}) => {
		if (part.type === "status") {
			return (
				<div data-testid={`part-status`} data-part-id={part.id}>
					<div data-testid="status-label">{part.label}</div>
					{part.detail && (
						<div data-testid="status-detail">{part.detail}</div>
					)}
				</div>
			);
		}
		return (
			<div data-testid={`part-${part.type}`}>
				{typeof part.content === "string" ? part.content : part.type}
			</div>
		);
	},
}));

vi.mock("../../models/ProviderIcon", () => ({
	ProviderIcon: () => <span>Provider</span>,
}));

const plan: PlanCardData = {
	id: "plan-flow-1",
	version: 1,
	sourceTurnId: "turn-plan-flow-1",
	goal: "Ship plan decision flow",
	summary: "Render the plan card from structured message parts.",
	steps: [
		{
			id: "step-1",
			title: "Render plan card",
			description: "Use the existing transcript renderer.",
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
	chatMessageStoreState.isLoadingMessages = false;
	chatMessageStoreState.hasOlderMessages = false;
	chatMessageStoreState.isLoadingOlderMessages = false;
	chatMessageStoreState.streamingContent = "";
});

describe("ChatMessageList plan parts", () => {
	it("renders PlanCard inside the assistant message flow", () => {
		const messages: Message[] = [
			{
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
			},
		];

		render(
			<ChatMessageList
				messages={messages}
				isStreaming={false}
				conversationId="conversation-1"
				bubbleListRef={{ current: null }}
				retryMessage={() => {}}
				editMessage={() => {}}
				deleteMessage={() => {}}
				respondToApproval={() => {}}
				onPlanDecision={() => {}}
			/>,
		);

		expect(container?.textContent).toContain("Ship plan decision flow");
		expect(
			Array.from(container?.querySelectorAll("input") ?? []).some(
				(input) => input.value === "Render plan card",
			),
		).toBe(true);
		expect(container?.textContent).toContain("Execute");
	});

	it("keeps hook order stable when loading switches to rendered messages", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const messages: Message[] = [
			{
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
			},
		];

		chatMessageStoreState.isLoadingMessages = true;
		render(
			<ChatMessageList
				messages={[]}
				isStreaming={false}
				conversationId="conversation-1"
				bubbleListRef={{ current: null }}
				retryMessage={() => {}}
				editMessage={() => {}}
				deleteMessage={() => {}}
				respondToApproval={() => {}}
				onPlanDecision={() => {}}
			/>,
		);

		chatMessageStoreState.isLoadingMessages = false;
		act(() => {
			root?.render(
				<ChatMessageList
					messages={messages}
					isStreaming={false}
					conversationId="conversation-1"
					bubbleListRef={{ current: null }}
					retryMessage={() => {}}
					editMessage={() => {}}
					deleteMessage={() => {}}
					respondToApproval={() => {}}
					onPlanDecision={() => {}}
				/>,
			);
		});

		expect(container?.textContent).toContain("Ship plan decision flow");
		expect(
			consoleError.mock.calls.some((call) =>
				String(call[0]).includes(
					"Rendered more hooks than during the previous render",
				),
			),
		).toBe(false);
		consoleError.mockRestore();
	});

	it("renders a cancelled plan part with the cancelled decision applied (replay)", () => {
		// Simulates the message the jsonl replay produces after applying a
		// `plan.decision` marker with action=cancel: the plan part is mutated
		// in-place with `pendingDecision:false`, `status:"decision-cancel"`,
		// and the decision payload attached. The transcript must still render
		// the plan card (goal + steps) without throwing.
		const messages: Message[] = [
			{
				id: "assistant-plan-cancel",
				role: "assistant",
				content: "",
				timestamp: 1000,
				parts: [
					{
						id: "assistant-plan-cancel:plan",
						type: "plan",
						state: "complete",
						createdAt: 1000,
						updatedAt: 1500,
						plan,
						pendingDecision: false,
						status: "decision-cancel",
						decision: {
							id: "decision-cancel-1",
							action: "cancel",
							sourcePlanId: plan.id,
							sourcePlanVersion: plan.version,
							sourcePlanTurnId: plan.sourceTurnId,
							reason: "User decided not to proceed.",
						},
					},
				] as unknown as Message["parts"],
			},
		];

		render(
			<ChatMessageList
				messages={messages}
				isStreaming={false}
				conversationId="conversation-1"
				bubbleListRef={{ current: null }}
				retryMessage={() => {}}
				editMessage={() => {}}
				deleteMessage={() => {}}
				respondToApproval={() => {}}
				onPlanDecision={() => {}}
			/>,
		);

		// Historical decisions render as read-only replay summaries, not a
		// second actionable PlanCard.
		expect(container?.textContent).toContain("Ship plan decision flow");
		expect(container?.textContent).toContain("Plan cancelled");
		expect(
			container?.querySelector("[data-testid='plan-decision-summary']"),
		).not.toBeNull();
		expect(container?.textContent).not.toContain("Execute");
		// No `plan_exec_link_*` status bubble should appear for a cancelled plan.
		expect(
			container?.querySelector("[data-testid='part-status']"),
		).toBeNull();
	});

	it("renders the plan_exec_link_* status part on the follow-up execute turn (replay)", () => {
		// Simulates the message shape produced after jsonl replay applies an
		// `execute.turn.created` marker: a synthetic status part with
		// id=`plan_exec_link_<planId>` is attached to the linked assistant
		// message so the transcript visually connects the plan turn to its
		// follow-up execute turn.
		const messages: Message[] = [
			{
				id: "assistant-plan-exec",
				role: "assistant",
				content: "",
				timestamp: 1000,
				parts: [
					{
						id: "assistant-plan-exec:plan",
						type: "plan",
						state: "complete",
						createdAt: 1000,
						updatedAt: 1500,
						plan,
						pendingDecision: false,
						status: "decision-execute",
						decision: {
							id: "decision-execute-1",
							action: "execute",
							sourcePlanId: plan.id,
							sourcePlanVersion: plan.version,
							sourcePlanTurnId: plan.sourceTurnId,
						},
					},
				] as unknown as Message["parts"],
			},
			{
				id: "user-execute-1",
				role: "user",
				content: "Execute the approved plan.",
				timestamp: 1600,
			},
			{
				id: "assistant-execute-1",
				role: "assistant",
				content: "Done executing the plan.",
				timestamp: 1700,
				parts: [
					{
						id: "assistant-execute-1:text",
						type: "text",
						state: "complete",
						createdAt: 1700,
						updatedAt: 1700,
						content: "Done executing the plan.",
					},
					{
						id: `plan_exec_link_${plan.id}`,
						type: "status",
						state: "complete",
						createdAt: 1700,
						updatedAt: 1700,
						label: "Plan executed",
						detail: `plan ${plan.id}#${plan.version} · turn user-execute-1`,
					},
				] as unknown as Message["parts"],
			},
		];

		render(
			<ChatMessageList
				messages={messages}
				isStreaming={false}
				conversationId="conversation-1"
				bubbleListRef={{ current: null }}
				retryMessage={() => {}}
				editMessage={() => {}}
				deleteMessage={() => {}}
				respondToApproval={() => {}}
				onPlanDecision={() => {}}
			/>,
		);

		expect(container?.textContent).toContain("Plan executed");
		expect(
			container?.querySelector("[data-testid='plan-decision-summary']"),
		).not.toBeNull();
		const statusBubble = container?.querySelector(
			"[data-testid='part-status']",
		);
		expect(statusBubble).not.toBeNull();
		expect(statusBubble?.getAttribute("data-part-id")).toBe(
			`plan_exec_link_${plan.id}`,
		);
		expect(
			container?.querySelector("[data-testid='status-label']")?.textContent,
		).toBe("Plan executed");
		const detailText = container?.querySelector(
			"[data-testid='status-detail']",
		)?.textContent;
		expect(detailText).toContain(`plan ${plan.id}#${plan.version}`);
		expect(detailText).toContain("turn user-execute-1");
	});

	it("virtualizes 500 user/assistant turns and only mounts visible code rows", () => {
		const messages: Message[] = [];
		for (let i = 0; i < 500; i++) {
			messages.push({
				id: `user-${i}`,
				role: "user",
				content: `prompt ${i}`,
				timestamp: 1000 + i * 2,
			});
			messages.push({
				id: `assistant-${i}`,
				role: "assistant",
				content: [
					`answer ${i}`,
					"```ts",
					`const visible_${i} = ${i};`,
					"```",
				].join("\n"),
				timestamp: 1001 + i * 2,
			});
		}

		render(
			<ChatMessageList
				messages={messages}
				isStreaming={false}
				conversationId="conversation-1"
				bubbleListRef={{ current: null }}
				retryMessage={() => {}}
				editMessage={() => {}}
				deleteMessage={() => {}}
				respondToApproval={() => {}}
				onPlanDecision={() => {}}
			/>,
		);

		const virtualList = container?.querySelector(
			'[data-testid="virtual-list"]',
		);
		expect(virtualList?.getAttribute("data-row-count")).toBe("1000");
		expect(container?.textContent).toContain("const visible_0 = 0;");
		expect(container?.textContent).toContain("const visible_5 = 5;");
		expect(container?.textContent).not.toContain("const visible_250 = 250;");
		expect(container?.querySelectorAll('[role="listitem"]')).toHaveLength(12);
	});
});

function render(element: React.ReactElement): void {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
}
