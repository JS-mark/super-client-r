import {
	CheckOutlined,
	CompassOutlined,
	EditFilled,
	GlobalOutlined,
	MessageOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { Button, Switch, Tooltip, theme } from "antd";
import { useTranslation } from "react-i18next";
import {
	formatShortcut,
	type Shortcut,
	type ShortcutScope,
} from "../../stores/shortcutStore";

const { useToken } = theme;

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

interface ShortcutItemProps {
	shortcut: Shortcut;
	isRecording: boolean;
	recordingId: string | null;
	onStartRecording: (id: string) => void;
	onStopRecording: () => void;
	onToggle: (id: string) => void;
	onReset: (id: string) => void;
	conflict: Shortcut | null;
	disabled?: boolean;
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
	disabled = false,
}: ShortcutItemProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
	const isModified = shortcut.currentKey !== shortcut.defaultKey;
	const isThisRecording = isRecording && recordingId === shortcut.id;
	const hasConflict = conflict?.id === shortcut.id;
	const dimmed = disabled || !shortcut.enabled;

	const displayKey = formatShortcut(shortcut.currentKey, isMac);

	return (
		<div
			className="flex items-center justify-between py-3 px-4 rounded-lg transition-colors"
			style={{
				backgroundColor: isThisRecording ? token.colorPrimaryBg : "transparent",
				opacity: dimmed ? 0.5 : 1,
			}}
		>
			{/* Left: name + description */}
			<div className="flex-1 min-w-0 mr-4">
				<div
					className="text-sm font-medium leading-snug"
					style={{ color: token.colorText }}
				>
					{t(shortcut.nameKey, {
						ns: "shortcuts",
						defaultValue: shortcut.name,
					})}
				</div>
				<div
					className="text-xs leading-snug mt-0.5"
					style={{ color: token.colorTextDescription }}
				>
					{t(shortcut.descriptionKey, {
						ns: "shortcuts",
						defaultValue: shortcut.description,
					})}
				</div>
			</div>

			{/* Right: key badge + actions */}
			<div className="flex items-center gap-3 shrink-0">
				{/* Shortcut key badge / recording state */}
				{isThisRecording ? (
					<div className="flex items-center gap-2">
						<div
							className="h-7 px-3 flex items-center rounded-md text-xs font-medium animate-pulse"
							style={{
								backgroundColor: hasConflict
									? token.colorErrorBg
									: token.colorPrimaryBg,
								color: hasConflict ? token.colorError : token.colorPrimary,
								border: `1px solid ${hasConflict ? token.colorError : token.colorPrimary}`,
							}}
						>
							{hasConflict
								? t("conflictDetected", { ns: "shortcuts" })
								: t("recording", { ns: "shortcuts" })}
						</div>
						<Button
							size="small"
							type="primary"
							icon={<CheckOutlined />}
							onClick={onStopRecording}
							className="!h-7 !w-7 !min-w-0"
						/>
					</div>
				) : (
					<div className="flex items-center gap-2">
						<button
							type="button"
							className="h-7 px-2.5 flex items-center rounded-md font-mono text-xs cursor-pointer border transition-colors hover:border-blue-400"
							style={{
								backgroundColor: token.colorFillQuaternary,
								borderColor: token.colorBorderSecondary,
								color: token.colorText,
							}}
							onClick={() => !disabled && onStartRecording(shortcut.id)}
							disabled={disabled}
						>
							{displayKey}
						</button>

						{isModified && (
							<Tooltip title={t("reset", "重置", { ns: "common" })}>
								<Button
									type="text"
									size="small"
									icon={<ReloadOutlined />}
									onClick={() => onReset(shortcut.id)}
									className="!h-7 !w-7 !min-w-0"
									style={{ color: token.colorTextTertiary }}
									disabled={disabled}
								/>
							</Tooltip>
						)}
					</div>
				)}

				{/* Toggle switch */}
				<Switch
					checked={shortcut.enabled}
					onChange={() => onToggle(shortcut.id)}
					size="small"
					disabled={disabled}
				/>
			</div>
		</div>
	);
}
