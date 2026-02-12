import {
	CheckOutlined,
	CompassOutlined,
	EditFilled,
	EditOutlined,
	GlobalOutlined,
	MessageOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { Button, Switch, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import {
	formatShortcut,
	type Shortcut,
	type ShortcutScope,
} from "../../stores/shortcutStore";

// Scope configuration
export const SCOPE_CONFIG: Record<
	ShortcutScope,
	{ labelKey: string; icon: React.ReactNode; color: string }
> = {
	global: {
		labelKey: "scope.global",
		icon: <GlobalOutlined />,
		color: "blue",
	},
	chat: {
		labelKey: "scope.chat",
		icon: <MessageOutlined />,
		color: "green",
	},
	navigation: {
		labelKey: "scope.navigation",
		icon: <CompassOutlined />,
		color: "purple",
	},
	input: {
		labelKey: "scope.input",
		icon: <EditFilled />,
		color: "orange",
	},
};

// Shortcut input component
interface ShortcutInputProps {
	value: string;
	onChange: (value: string) => void;
	isRecording: boolean;
	onStartRecording: () => void;
	onStopRecording: () => void;
	conflict?: Shortcut | null;
}

function ShortcutInput({
	value,
	onChange,
	isRecording,
	onStartRecording,
	onStopRecording,
	conflict,
}: ShortcutInputProps) {
	const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
	const displayValue = formatShortcut(value, isMac);

	if (isRecording) {
		return (
			<div className="flex items-center gap-2">
				<div
					className={cn(
						"flex-1 h-10 px-3 flex items-center justify-center rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 animate-pulse",
						conflict && "border-red-500 bg-red-50 dark:bg-red-900/20",
					)}
				>
					<span className="text-sm font-medium text-blue-600 dark:text-blue-400">
						{conflict ? "快捷键冲突!" : "按下快捷键..."}
					</span>
				</div>
				<Button
					size="small"
					onClick={onStopRecording}
					icon={<CheckOutlined />}
					type="primary"
				/>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					"flex-1 h-10 px-3 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm",
					conflict && "border-red-500 text-red-500",
				)}
			>
				{displayValue}
			</div>
			<Tooltip title="修改快捷键">
				<Button
					size="small"
					onClick={onStartRecording}
					icon={<EditOutlined />}
				/>
			</Tooltip>
		</div>
	);
}

// Single shortcut setting item
interface ShortcutItemProps {
	shortcut: Shortcut;
	isRecording: boolean;
	recordingId: string | null;
	onStartRecording: (id: string) => void;
	onStopRecording: () => void;
	onToggle: (id: string) => void;
	onReset: (id: string) => void;
	conflict: Shortcut | null;
}

export function ShortcutItem({
	shortcut,
	isRecording,
	recordingId,
	onStartRecording,
	onStopRecording,
	onToggle,
	onReset,
	conflict,
}: ShortcutItemProps) {
	const { t } = useTranslation();
	const scopeConfig = SCOPE_CONFIG[shortcut.scope];
	const isModified = shortcut.currentKey !== shortcut.defaultKey;

	return (
		<div
			className={cn(
				"flex items-center justify-between p-4 rounded-xl border transition-all",
				shortcut.enabled
					? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
					: "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60",
			)}
		>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<Tag color={scopeConfig.color} className="text-xs">
						{scopeConfig.icon}
						<span className="ml-1">{t(scopeConfig.labelKey, { ns: "shortcuts" })}</span>
					</Tag>
					{isModified && (
						<Tag color="orange" className="text-xs">
							{t("smodified", "已修改", { ns: 'shortcuts' })}
						</Tag>
					)}
				</div>
				<div className="font-medium text-slate-800 dark:text-slate-200">
					{t(shortcut.nameKey, shortcut.name)}
				</div>
				<div className="text-xs text-slate-500 dark:text-slate-400">
					{t(shortcut.descriptionKey, shortcut.description)}
				</div>
			</div>

			<div className="flex items-center gap-4 ml-4">
				<div className="w-[180px]">
					<ShortcutInput
						value={shortcut.currentKey}
						onChange={() => { }}
						isRecording={isRecording && recordingId === shortcut.id}
						onStartRecording={() => onStartRecording(shortcut.id)}
						onStopRecording={onStopRecording}
						conflict={conflict?.id === shortcut.id ? conflict : null}
					/>
				</div>

				<div className="flex items-center gap-2">
					<Switch
						checked={shortcut.enabled}
						onChange={() => onToggle(shortcut.id)}
						size="small"
					/>

					{isModified && (
						<Tooltip title={t("reset", "重置", { ns: "common" })}>
							<Button
								size="small"
								onClick={() => onReset(shortcut.id)}
								icon={<ReloadOutlined />}
							/>
						</Tooltip>
					)}
				</div>
			</div>
		</div>
	);
}
