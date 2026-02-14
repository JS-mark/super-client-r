import {
	KeyOutlined,
	ReloadOutlined,
	WarningOutlined,
} from "@ant-design/icons";
import {
	Alert,
	Button,
	Empty,
	Input,
	Modal,
	message,
	theme,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type Shortcut,
	type ShortcutScope,
	useShortcutStore,
} from "../../stores/shortcutStore";
import { SCOPE_CONFIG, ShortcutItem } from "./ShortcutItem";

const { useToken } = theme;

export function ShortcutSettings() {
	const { t } = useTranslation();
	const { token } = useToken();
	const {
		shortcuts,
		isRecording,
		recordingShortcutId,
		initDefaultShortcuts,
		startRecording,
		stopRecording,
		toggleShortcut,
		resetShortcut,
		resetAllShortcuts,
		checkConflict,
	} = useShortcutStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [selectedScope, setSelectedScope] = useState<ShortcutScope | "all">(
		"all",
	);
	const [conflict, setConflict] = useState<Shortcut | null>(null);

	// 初始化默认快捷键
	useEffect(() => {
		initDefaultShortcuts();
	}, [initDefaultShortcuts]);

	// 监听冲突事件
	useEffect(() => {
		const handleConflict = (e: CustomEvent) => {
			const { conflictWith } = e.detail;
			setConflict(conflictWith);
			message.warning(
				t("conflictWarning", {
					ns: "shortcuts",
					name: t(conflictWith.nameKey, { ns: "shortcuts", defaultValue: conflictWith.name }),
				}),
			);
		};

		window.addEventListener("shortcut-conflict" as any, handleConflict);
		return () => {
			window.removeEventListener("shortcut-conflict" as any, handleConflict);
		};
	}, [t]);

	// 处理开始录制
	const handleStartRecording = useCallback(
		(id: string) => {
			setConflict(null);
			startRecording(id);
		},
		[startRecording],
	);

	// 处理停止录制
	const handleStopRecording = useCallback(() => {
		stopRecording();
	}, [stopRecording]);

	// 处理重置所有
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

	// 过滤快捷键
	const filteredShortcuts = shortcuts.filter((s) => {
		const matchesSearch =
			!searchQuery ||
			t(s.nameKey, { ns: "shortcuts", defaultValue: s.name }).toLowerCase().includes(searchQuery.toLowerCase()) ||
			t(s.descriptionKey, { ns: "shortcuts", defaultValue: s.description })
				.toLowerCase()
				.includes(searchQuery.toLowerCase());
		const matchesScope = selectedScope === "all" || s.scope === selectedScope;
		return matchesSearch && matchesScope;
	});

	// 按作用域分组
	const groupedShortcuts = filteredShortcuts.reduce(
		(acc, shortcut) => {
			if (!acc[shortcut.scope]) {
				acc[shortcut.scope] = [];
			}
			acc[shortcut.scope].push(shortcut);
			return acc;
		},
		{} as Record<ShortcutScope, Shortcut[]>,
	);

	// 统计信息
	const stats = {
		total: shortcuts.length,
		enabled: shortcuts.filter((s) => s.enabled).length,
		modified: shortcuts.filter((s) => s.currentKey !== s.defaultKey).length,
	};

	return (
		<div className="space-y-6">
			{/* 标题和统计 */}
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-lg font-semibold flex items-center gap-2" style={{ color: token.colorTextHeading }}>
						<KeyOutlined />
						{t("title", { ns: "shortcuts" })}
					</h3>
					<p className="text-sm mt-1" style={{ color: token.colorTextSecondary }}>
						{t("subtitle", { ns: "shortcuts" })}
					</p>
				</div>
				<div className="flex items-center gap-4 text-sm text-slate-500">
					<span>
						{t("stats.enabled", { ns: "shortcuts" })}: {stats.enabled}/
						{stats.total}
					</span>
					{stats.modified > 0 && (
						<span className="text-orange-500">
							{t("stats.modified", { ns: "shortcuts" })}: {stats.modified}
						</span>
					)}
				</div>
			</div>

			{/* 提示信息 */}
			<Alert
				message={t("tips.title", { ns: "shortcuts" })}
				description={
					<div className="text-sm space-y-1">
						<p>{t("tips.line1", { ns: "shortcuts" })}</p>
						<p>{t("tips.line2", { ns: "shortcuts" })}</p>
						<p>{t("tips.line3", { ns: "shortcuts" })}</p>
					</div>
				}
				type="info"
				showIcon
				style={{
					backgroundColor: token.colorInfoBg,
					borderColor: token.colorInfoBorder,
				}}
			/>

			{/* 过滤器和搜索 */}
			<div className="flex items-center gap-4">
				<Input
					placeholder={t("search", { ns: "shortcuts" })}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="flex-1"
					prefix={<KeyOutlined className="text-slate-400" />}
					allowClear
				/>
				<div className="flex gap-2">
					{(Object.keys(SCOPE_CONFIG) as ShortcutScope[]).map((scope) => (
						<Button
							key={scope}
							size="small"
							type={selectedScope === scope ? "primary" : "default"}
							onClick={() =>
								setSelectedScope(selectedScope === scope ? "all" : scope)
							}
						>
							{SCOPE_CONFIG[scope].icon}
							<span className="ml-1">{t(SCOPE_CONFIG[scope].labelKey, { ns: "shortcuts" })}</span>
						</Button>
					))}
				</div>
			</div>

			{/* 快捷键列表 */}
			<div className="space-y-4">
				{filteredShortcuts.length === 0 ? (
					<Empty
						description={t("noResults", { ns: "shortcuts" })}
						image={Empty.PRESENTED_IMAGE_SIMPLE}
					/>
				) : (
					(Object.keys(groupedShortcuts) as ShortcutScope[]).map((scope) => (
						<div key={scope}>
							<div className="flex items-center gap-2 mb-3">
								{SCOPE_CONFIG[scope].icon}
								<span className="font-medium" style={{ color: token.colorText }}>
									{t(SCOPE_CONFIG[scope].labelKey, { ns: "shortcuts" })}
								</span>
								<span className="text-xs text-slate-400">
									({groupedShortcuts[scope].length})
								</span>
							</div>
							<div className="space-y-2">
								{groupedShortcuts[scope].map((shortcut) => (
									<ShortcutItem
										key={shortcut.id}
										shortcut={shortcut}
										isRecording={isRecording}
										recordingId={recordingShortcutId}
										onStartRecording={handleStartRecording}
										onStopRecording={handleStopRecording}
										onToggle={toggleShortcut}
										onReset={resetShortcut}
										conflict={conflict}
									/>
								))}
							</div>
						</div>
					))
				)}
			</div>

			{/* 底部操作 */}
			<div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: token.colorBorder }}>
				<div className="text-sm text-slate-500">
					{isRecording && (
						<span className="flex items-center gap-2 text-blue-500">
							<WarningOutlined className="animate-pulse" />
							{t("recordingHint", { ns: "shortcuts" })}
						</span>
					)}
				</div>
				{stats.modified > 0 && (
					<Button onClick={handleResetAll} danger>
						<ReloadOutlined />
						{t("resetAll", { ns: "shortcuts" })}
					</Button>
				)}
			</div>
		</div>
	);
}
