/**
 * RemoteSessionsPanel — Remote lifecycle 7/7 (final sub-workflow).
 *
 * Lists every remote binding known to `RemoteChatBridge` along with its
 * classified lifecycle state (`bound-idle` / `archived` / `tombstoned` /
 * `bot-offline` / `bot-missing`-adjacent / …). Lets the user unbind a
 * problematic binding directly instead of hunting for it in a
 * conversation.
 *
 * State ownership: point-in-time snapshot pulled via
 * `remoteSessionService.listBindings()`. Re-fetches on the four
 * lifecycle broadcast channels (`onBotMissing`, `onBotOffline`,
 * `onInactiveReceived`, `onOutboundRejected`) so the list stays fresh
 * without a manual refresh button, but exposes one anyway.
 */
import { App, Button, Empty, Tag, Typography } from "antd";
import { DeleteOutlined, ExclamationCircleFilled, ReloadOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LiteList as List } from "@/components/ui/LiteList";
import type {
	RemoteBindingListEntry,
	RemoteLifecycleState,
} from "@super-client/shared-types/electron-api";
import { remoteSessionService } from "../../services/remoteSessionService";

const { Text } = Typography;

function stateColor(state: RemoteLifecycleState): string {
	switch (state) {
		case "bound-idle":
		case "bound-active":
			return "green";
		case "archived":
			return "gold";
		case "tombstoned":
			return "red";
		case "bot-offline":
		case "error-recoverable":
			return "orange";
		case "error-fatal":
			return "volcano";
		case "unbound":
		default:
			return "default";
	}
}

export function RemoteSessionsPanel() {
	const { t } = useTranslation();
	const { modal, message } = App.useApp();
	const [entries, setEntries] = useState<RemoteBindingListEntry[]>([]);
	const [loading, setLoading] = useState(false);

	const loadEntries = useCallback(async () => {
		setLoading(true);
		try {
			const result = await remoteSessionService.listBindings();
			if (result.success && result.data) {
				setEntries(result.data);
			}
		} catch (error) {
			console.warn("[RemoteSessionsPanel] listBindings failed:", error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadEntries();
	}, [loadEntries]);

	// Auto-refresh on any lifecycle broadcast so users see status changes
	// (bot goes offline, IM arrives for tombstoned session, etc.) without
	// manual refresh.
	useEffect(() => {
		const unsubs = [
			window.electron.remoteChat.onBotMissing(() => void loadEntries()),
			window.electron.remoteChat.onBotOffline(() => void loadEntries()),
			window.electron.remoteChat.onInactiveReceived(() => void loadEntries()),
			window.electron.remoteChat.onOutboundRejected(() => void loadEntries()),
		];
		return () => {
			for (const u of unsubs) u();
		};
	}, [loadEntries]);

	const handleUnbind = useCallback(
		(entry: RemoteBindingListEntry) => {
			modal.confirm({
				icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
				title: t(
					"settingsNav.recovery.remoteUnbindTitle",
					"Unbind this remote session?",
					{ ns: "settings" },
				),
				content: t(
					"settingsNav.recovery.remoteUnbindContent",
					"Removes the binding between this conversation and {{platform}} chat {{chatId}}. Message history stays; you can re-bind later.",
					{
						ns: "settings",
						platform: entry.binding.platform,
						chatId: entry.binding.chatId,
					},
				),
				okText: t("settingsNav.recovery.unbindOk", "Unbind", {
					ns: "settings",
				}),
				okButtonProps: { danger: true },
				cancelText: t("common.cancel", "Cancel"),
				async onOk() {
					try {
						const result = await remoteSessionService.unbind(
							entry.conversationId,
						);
						if (!result.success) {
							throw new Error(result.error ?? "unbind failed");
						}
						message.success(
							t("settingsNav.recovery.remoteUnbindSuccess", "Remote unbound", {
								ns: "settings",
							}),
						);
						void loadEntries();
					} catch (error) {
						console.warn("[RemoteSessionsPanel] unbind failed:", error);
						message.error(
							t("settingsNav.recovery.remoteUnbindError", "Unbind failed", {
								ns: "settings",
							}),
						);
					}
				},
			});
		},
		[modal, message, loadEntries, t],
	);

	const sorted = useMemo(() => {
		// Surface problematic bindings first (tombstoned / bot-offline /
		// archived) so users see recoverable state at the top.
		const priority: Record<RemoteLifecycleState, number> = {
			tombstoned: 0,
			"error-fatal": 1,
			"bot-offline": 2,
			"error-recoverable": 3,
			archived: 4,
			"bound-active": 5,
			"bound-idle": 6,
			unbound: 7,
		};
		return [...entries].sort(
			(a, b) => (priority[a.state] ?? 9) - (priority[b.state] ?? 9),
		);
	}, [entries]);

	if (entries.length === 0 && !loading) {
		return (
			<Empty
				description={t(
					"settingsNav.recovery.noRemoteBindings",
					"No remote-bound sessions",
					{ ns: "settings" },
				)}
				image={Empty.PRESENTED_IMAGE_SIMPLE}
				className="py-8"
			/>
		);
	}

	return (
		<div className="space-y-3" data-testid="remote-sessions-panel">
			<div className="flex items-center justify-between">
				<Text type="secondary" className="block text-sm">
					{t(
						"settingsNav.recovery.remoteBindingsHint",
						"All conversations currently bound to an IM chat. Unbind removes the link; message history stays.",
						{ ns: "settings" },
					)}
				</Text>
				<Button
					size="small"
					icon={<ReloadOutlined />}
					loading={loading}
					onClick={() => void loadEntries()}
					data-testid="remote-sessions-refresh"
				>
					{t("settingsNav.recovery.refresh", "Refresh", { ns: "settings" })}
				</Button>
			</div>
			<List
				bordered
				dataSource={sorted}
				rowKey="conversationId"
				renderItem={(entry) => (
					<List.Item
						actions={[
							<Button
								key="unbind"
								type="link"
								danger
								icon={<DeleteOutlined />}
								onClick={() => handleUnbind(entry)}
								data-testid={`remote-unbind-${entry.conversationId}`}
							>
								{t("settingsNav.recovery.unbind", "Unbind", { ns: "settings" })}
							</Button>,
						]}
					>
						<List.Item.Meta
							title={
								<span className="flex items-center gap-2">
									<span>{entry.binding.botName}</span>
									<Tag>{entry.binding.platform}</Tag>
									<Tag
										color={stateColor(entry.state)}
										data-testid={`remote-state-${entry.conversationId}`}
									>
										{t(
											`settingsNav.recovery.remoteState.${entry.state}`,
											entry.state,
											{ ns: "settings" },
										)}
									</Tag>
								</span>
							}
							description={
								<div className="flex flex-col gap-0.5 text-xs">
									<code className="text-slate-500">{entry.conversationId}</code>
									<span className="text-slate-400">
										chat: {entry.binding.chatId} · bound{" "}
										{new Date(entry.binding.boundAt).toLocaleString()}
									</span>
								</div>
							}
						/>
					</List.Item>
				)}
			/>
		</div>
	);
}
