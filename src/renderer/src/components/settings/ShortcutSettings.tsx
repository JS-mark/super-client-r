import {
	ReloadOutlined,
	SearchOutlined,
	WarningOutlined,
} from "@ant-design/icons";
import {
	Button,
	Empty,
	Input,
	Modal,
	Segmented,
	Switch,
	message,
	theme,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type Shortcut,
	type ShortcutScope,
	useShortcutStore,
} from "../../stores/shortcutStore";
import { SCOPE_CONFIG, ShortcutItem } from "./ShortcutItem";

const { useToken } = theme;

const SCOPES: ShortcutScope[] = ["global", "chat", "navigation", "input"];

export function ShortcutSettings() {
	const { t } = useTranslation();
	const { token } = useToken();
	const {
		shortcuts,
		globalEnabled,
		isRecording,
		recordingShortcutId,
		initDefaultShortcuts,
		startRecording,
		stopRecording,
		toggleGlobalEnabled,
		toggleShortcut,
		resetShortcut,
		resetAllShortcuts,
	} = useShortcutStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedScope, setSelectedScope] = useState<ShortcutScope | "all">(
		"all",
	);
	const [conflict, setConflict] = useState<Shortcut | null>(null);

	useEffect(() => {
		initDefaultShortcuts();
	}, [initDefaultShortcuts]);

	useEffect(() => {
		const handleConflict = (e: CustomEvent) => {
			const { conflictWith } = e.detail;
			setConflict(conflictWith);
			message.warning(
				t("conflictWarning", {
					ns: "shortcuts",
					name: t(conflictWith.nameKey, {
						ns: "shortcuts",
						defaultValue: conflictWith.name,
					}),
				}),
			);
		};
		window.addEventListener("shortcut-conflict" as any, handleConflict);
		return () => {
			window.removeEventListener("shortcut-conflict" as any, handleConflict);
		};
	}, [t]);

	const handleStartRecording = useCallback(
		(id: string) => {
			setConflict(null);
			startRecording(id);
		},
		[startRecording],
	);

	const handleStopRecording = useCallback(() => {
		stopRecording();
	}, [stopRecording]);

	const handleResetAll = useCallback(() => {
		Modal.confirm({
			title: t("resetAllTitle", { ns: "shortcuts" }),
			content: t("resetAllConfirm", { ns: "shortcuts" }),
			okText: t("confirm", { ns: "common" }),
			cancelText: t("cancel", { ns: "common" }),
			onOk: () => {
				resetAllShortcuts();
				message.success(t("resetAllSuccess", { ns: "shortcuts" }));
			},
		});
	}, [resetAllShortcuts, t]);

	// Filter shortcuts
	const filteredShortcuts = useMemo(() => {
		return shortcuts.filter((s) => {
			const matchesSearch =
				!searchQuery ||
				t(s.nameKey, { ns: "shortcuts", defaultValue: s.name })
					.toLowerCase()
					.includes(searchQuery.toLowerCase()) ||
				t(s.descriptionKey, { ns: "shortcuts", defaultValue: s.description })
					.toLowerCase()
					.includes(searchQuery.toLowerCase());
			const matchesScope = selectedScope === "all" || s.scope === selectedScope;
			return matchesSearch && matchesScope;
		});
	}, [shortcuts, searchQuery, selectedScope, t]);

	// Group by scope
	const groupedShortcuts = useMemo(() => {
		return filteredShortcuts.reduce(
			(acc, shortcut) => {
				if (!acc[shortcut.scope]) {
					acc[shortcut.scope] = [];
				}
				acc[shortcut.scope].push(shortcut);
				return acc;
			},
			{} as Record<ShortcutScope, Shortcut[]>,
		);
	}, [filteredShortcuts]);

	// Stats
	const stats = useMemo(
		() => ({
			total: shortcuts.length,
			enabled: shortcuts.filter((s) => s.enabled).length,
			modified: shortcuts.filter((s) => s.currentKey !== s.defaultKey).length,
		}),
		[shortcuts],
	);

	// Scope segmented options
	const scopeOptions = useMemo(
		() => [
			{ label: t("allScopes", { ns: "shortcuts" }), value: "all" },
			...SCOPES.map((scope) => ({
				label: (
					<span className="flex items-center gap-1.5">
						{SCOPE_CONFIG[scope].icon}
						{t(SCOPE_CONFIG[scope].labelKey, { ns: "shortcuts" })}
					</span>
				),
				value: scope,
			})),
		],
		[t],
	);

	return (
		<div className="space-y-5">
			{/* Header: global toggle */}
			<div
				className="flex items-center justify-between p-4 rounded-xl"
				style={{
					backgroundColor: token.colorFillQuaternary,
				}}
			>
				<div className="flex-1">
					<div
						className="text-sm font-medium"
						style={{ color: token.colorText }}
					>
						{t("globalEnabled", { ns: "shortcuts" })}
					</div>
					<div
						className="text-xs mt-0.5"
						style={{ color: token.colorTextDescription }}
					>
						{t("globalEnabledDesc", { ns: "shortcuts" })}
					</div>
				</div>
				<Switch checked={globalEnabled} onChange={toggleGlobalEnabled} />
			</div>

			{/* Search + scope filter */}
			<div className="flex items-center gap-3">
				<Input
					placeholder={t("search", { ns: "shortcuts" })}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					prefix={
						<SearchOutlined style={{ color: token.colorTextQuaternary }} />
					}
					allowClear
					className="flex-1"
					disabled={!globalEnabled}
				/>
				<Segmented
					options={scopeOptions}
					value={selectedScope}
					onChange={(val) => setSelectedScope(val as ShortcutScope | "all")}
					size="middle"
					disabled={!globalEnabled}
				/>
			</div>

			{/* Shortcut list grouped by scope */}
			<div className="space-y-4">
				{filteredShortcuts.length === 0 ? (
					<Empty
						description={t("noResults", { ns: "shortcuts" })}
						image={Empty.PRESENTED_IMAGE_SIMPLE}
					/>
				) : (
					(Object.keys(groupedShortcuts) as ShortcutScope[]).map((scope) => (
						<div key={scope}>
							{/* Scope header */}
							<div className="flex items-center gap-2 mb-1 px-4">
								<span
									className="text-xs font-medium uppercase tracking-wide"
									style={{ color: token.colorTextTertiary }}
								>
									{t(SCOPE_CONFIG[scope].labelKey, { ns: "shortcuts" })}
								</span>
								<div
									className="flex-1 h-px"
									style={{ backgroundColor: token.colorBorderSecondary }}
								/>
								<span
									className="text-xs"
									style={{ color: token.colorTextQuaternary }}
								>
									{groupedShortcuts[scope].length}
								</span>
							</div>

							{/* Items */}
							<div
								className="rounded-xl border overflow-hidden"
								style={{
									borderColor: token.colorBorderSecondary,
								}}
							>
								{groupedShortcuts[scope].map((shortcut, idx) => (
									<div key={shortcut.id}>
										{idx > 0 && (
											<div
												className="h-px mx-4"
												style={{ backgroundColor: token.colorBorderSecondary }}
											/>
										)}
										<ShortcutItem
											shortcut={shortcut}
											isRecording={isRecording}
											recordingId={recordingShortcutId}
											onStartRecording={handleStartRecording}
											onStopRecording={handleStopRecording}
											onToggle={toggleShortcut}
											onReset={resetShortcut}
											conflict={conflict}
											disabled={!globalEnabled}
										/>
									</div>
								))}
							</div>
						</div>
					))
				)}
			</div>

			{/* Footer: recording hint + reset all */}
			<div
				className="flex items-center justify-between pt-4 border-t"
				style={{ borderColor: token.colorBorderSecondary }}
			>
				<div className="text-xs" style={{ color: token.colorTextQuaternary }}>
					{isRecording ? (
						<span
							className="flex items-center gap-1.5"
							style={{ color: token.colorPrimary }}
						>
							<WarningOutlined className="animate-pulse" />
							{t("recordingHint", { ns: "shortcuts" })}
						</span>
					) : (
						<span>
							{t("stats.enabled", { ns: "shortcuts" })}: {stats.enabled}/
							{stats.total}
							{stats.modified > 0 && (
								<span style={{ color: token.colorWarning }}>
									{" · "}
									{t("stats.modified", { ns: "shortcuts" })}: {stats.modified}
								</span>
							)}
						</span>
					)}
				</div>
				{stats.modified > 0 && (
					<Button
						size="small"
						onClick={handleResetAll}
						icon={<ReloadOutlined />}
						disabled={!globalEnabled}
					>
						{t("resetAll", { ns: "shortcuts" })}
					</Button>
				)}
			</div>
		</div>
	);
}
