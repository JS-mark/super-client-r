import type * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteBindingListEntry } from "@super-client/shared-types/electron-api";
import { RemoteSessionsPanel } from "../RemoteSessionsPanel";

// antd Button's click-wave crashes under jsdom (reads undefined.ELEMENT_NODE);
// mirror the mock pattern from RecoveryWizardPanel.test.tsx.
vi.mock("antd", () => {
	type MockButtonProps = Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		"type"
	> & { icon?: React.ReactNode; loading?: boolean; type?: string; danger?: boolean };
	function Button({
		icon,
		children,
		disabled,
		loading,
		onClick,
		type: _type,
		danger: _danger,
		...rest
	}: MockButtonProps) {
		return (
			<button
				data-loading={loading ? "true" : undefined}
				disabled={disabled}
				onClick={onClick}
				{...rest}
			>
				{icon}
				{children}
			</button>
		);
	}
	function Empty({
		description,
	}: {
		description?: React.ReactNode;
		image?: unknown;
		className?: string;
	}) {
		return <div data-testid="empty">{description}</div>;
	}
	Empty.PRESENTED_IMAGE_SIMPLE = "simple";
	function Tag({
		children,
		"data-testid": testId,
	}: {
		children?: React.ReactNode;
		color?: string;
		"data-testid"?: string;
	}) {
		return <span data-testid={testId}>{children}</span>;
	}
	const Typography = {
		Text({ children }: { children?: React.ReactNode; type?: string; className?: string }) {
			return <span>{children}</span>;
		},
	};
	// modal.confirm synchronously invokes onOk so tests can assert IPC.
	const modalMock = {
		confirm: (opts: { onOk?: () => unknown | Promise<unknown> }) => {
			void opts.onOk?.();
			return { destroy: () => {}, update: () => {} };
		},
	};
	function App({ children }: { children?: React.ReactNode }) {
		return <>{children}</>;
	}
	App.useApp = () => ({
		modal: modalMock,
		message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
		notification: { open: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
	});
	return { App, Button, Empty, Tag, Typography };
});

vi.mock("@ant-design/icons", () => ({
	DeleteOutlined: () => <span aria-hidden="true" />,
	ExclamationCircleFilled: () => <span aria-hidden="true" />,
	ReloadOutlined: () => <span aria-hidden="true" />,
}));

vi.mock("@/components/ui/LiteList", () => {
	type ListItemActionsProps = {
		children: React.ReactNode;
		actions?: React.ReactNode[];
	};
	function ListItem({ children, actions }: ListItemActionsProps) {
		return (
			<div data-testid="list-item">
				{children}
				<div data-testid="list-item-actions">{actions}</div>
			</div>
		);
	}
	ListItem.Meta = function Meta({
		title,
		description,
	}: {
		title?: React.ReactNode;
		description?: React.ReactNode;
	}) {
		return (
			<>
				<div data-testid="list-item-title">{title}</div>
				<div data-testid="list-item-description">{description}</div>
			</>
		);
	};
	function LiteList<T>({
		dataSource,
		renderItem,
	}: {
		dataSource: T[];
		renderItem: (item: T) => React.ReactNode;
		rowKey?: string;
		bordered?: boolean;
	}) {
		return (
			<div data-testid="lite-list">
				{dataSource.map((item, i) => (
					<div key={i}>{renderItem(item)}</div>
				))}
			</div>
		);
	}
	LiteList.Item = ListItem;
	return { LiteList };
});

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback: string | Record<string, unknown>) =>
			typeof fallback === "string" ? fallback : (fallback?.defaultValue as string) ?? "",
	}),
}));

vi.mock("../../../services/remoteSessionService", () => ({
	remoteSessionService: {
		listBindings: vi.fn(),
		unbind: vi.fn(),
	},
}));

import { remoteSessionService } from "../../../services/remoteSessionService";

function makeEntry(overrides?: Partial<RemoteBindingListEntry>): RemoteBindingListEntry {
	return {
		conversationId: "conv-1",
		binding: {
			botId: "bot-1",
			chatId: "chat-1",
			botName: "Test Bot",
			platform: "telegram",
			boundAt: Date.now(),
		},
		state: "bound-idle",
		...overrides,
	};
}

interface Harness {
	root: Root;
	container: HTMLDivElement;
}

async function renderPanel(): Promise<Harness> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<RemoteSessionsPanel />);
		// Two microtasks: one for initial useEffect (listBindings), one for setState settle.
		await Promise.resolve();
		await Promise.resolve();
	});
	return { root, container };
}

// window.electron.remoteChat.on* subs used inside the panel.
const onBotMissing = vi.fn(() => () => {});
const onBotOffline = vi.fn(() => () => {});
const onInactiveReceived = vi.fn(() => () => {});
const onOutboundRejected = vi.fn(() => () => {});
beforeEach(() => {
	onBotMissing.mockClear();
	onBotOffline.mockClear();
	onInactiveReceived.mockClear();
	onOutboundRejected.mockClear();
	Object.defineProperty(window, "electron", {
		value: {
			remoteChat: {
				onBotMissing,
				onBotOffline,
				onInactiveReceived,
				onOutboundRejected,
			},
		},
		configurable: true,
	});
});

describe("RemoteSessionsPanel", () => {
	let harness: Harness | undefined;

	beforeEach(() => {
		harness = undefined;
	});
	afterEach(() => {
		const h = harness;
		if (h) {
			act(() => {
				h.root.unmount();
			});
			h.container.remove();
		}
	});

	it("renders the empty state when no bindings are returned", async () => {
		(remoteSessionService.listBindings as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			data: [],
		});
		harness = await renderPanel();
		expect(harness.container.querySelector("[data-testid='empty']")).toBeTruthy();
	});

	it("lists each binding with a state Tag and Unbind button", async () => {
		(remoteSessionService.listBindings as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			data: [
				makeEntry({ conversationId: "conv-a", state: "bound-idle" }),
				makeEntry({ conversationId: "conv-b", state: "tombstoned" }),
			],
		});
		harness = await renderPanel();
		expect(
			harness.container.querySelector("[data-testid='remote-state-conv-a']")
				?.textContent,
		).toBe("bound-idle");
		expect(
			harness.container.querySelector("[data-testid='remote-state-conv-b']")
				?.textContent,
		).toBe("tombstoned");
		expect(
			harness.container.querySelector("[data-testid='remote-unbind-conv-a']"),
		).toBeTruthy();
	});

	it("subscribes to all 4 lifecycle broadcast channels for auto-refresh", async () => {
		(remoteSessionService.listBindings as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			data: [],
		});
		harness = await renderPanel();
		expect(onBotMissing).toHaveBeenCalledOnce();
		expect(onBotOffline).toHaveBeenCalledOnce();
		expect(onInactiveReceived).toHaveBeenCalledOnce();
		expect(onOutboundRejected).toHaveBeenCalledOnce();
	});

	it("clicking Unbind calls remoteSessionService.unbind with the conversation id", async () => {
		(remoteSessionService.listBindings as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			data: [makeEntry({ conversationId: "conv-x" })],
		});
		(remoteSessionService.unbind as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
		});
		harness = await renderPanel();
		const unbindBtn = harness.container.querySelector(
			"[data-testid='remote-unbind-conv-x']",
		) as HTMLButtonElement;
		expect(unbindBtn).toBeTruthy();
		await act(async () => {
			unbindBtn.click();
			await Promise.resolve();
			await Promise.resolve();
		});
		expect(remoteSessionService.unbind).toHaveBeenCalledWith("conv-x");
	});

	it("sorts problematic states (tombstoned) before healthy ones (bound-idle)", async () => {
		(remoteSessionService.listBindings as ReturnType<typeof vi.fn>).mockResolvedValue({
			success: true,
			data: [
				makeEntry({ conversationId: "healthy", state: "bound-idle" }),
				makeEntry({ conversationId: "bad", state: "tombstoned" }),
			],
		});
		harness = await renderPanel();
		const items = harness.container.querySelectorAll(
			"[data-testid='list-item']",
		);
		expect(items).toHaveLength(2);
		// First item should carry the tombstoned tag (priority 0 in the sort).
		expect(items[0].textContent).toContain("tombstoned");
	});
});
