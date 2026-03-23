import {
	ApiOutlined,
	RobotOutlined,
	ThunderboltOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import { mcpClient } from "../../services/mcp/mcpService";
import type { ChatMode } from "../../hooks/useChat";

export interface ChatModeSelection {
	mode: ChatMode;
}

export interface ChatModePanelProps {
	chatMode: ChatMode;
	onSelect: (selection: ChatModeSelection) => void;
	onClose: () => void;
}

export function ChatModePanel({
	chatMode,
	onSelect,
	onClose,
}: ChatModePanelProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const panelRef = useRef<HTMLDivElement>(null);

	// MCP tools count for status indicator
	const [mcpToolCount, setMcpToolCount] = useState(0);
	const [mcpServerCount, setMcpServerCount] = useState(0);

	// Load MCP status on mount
	useEffect(() => {
		mcpClient
			.getAllTools()
			.then((tools) => {
				setMcpToolCount(tools.length);
				const serverIds = new Set(tools.map((t) => t.serverId));
				setMcpServerCount(serverIds.size);
			})
			.catch(() => {
				setMcpToolCount(0);
				setMcpServerCount(0);
			});
	}, []);

	// Click outside to close
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 0);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// ESC to close
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	const handleSelectDirect = useCallback(() => {
		onSelect({ mode: "direct" });
	}, [onSelect]);

	const handleSelectAgent = useCallback(() => {
		onSelect({ mode: "agent" });
	}, [onSelect]);

	return (
		<div
			ref={panelRef}
			className="w-full rounded-lg overflow-hidden shadow-2xl"
			style={{
				backgroundColor: token.colorBgElevated,
				borderColor: token.colorBorderSecondary,
				borderWidth: 1,
				borderStyle: "solid",
			}}
		>
			{/* Header */}
			<div
				className="px-3 py-2 text-xs font-medium"
				style={{ color: token.colorTextSecondary }}
			>
				{t("chatMode.switchMode", "切换模式", { ns: "chat" })}
			</div>

			{/* Mode list */}
			<div className="py-1 max-h-[320px] overflow-y-auto">
				{/* Direct mode */}
				<button
					type="button"
					onClick={handleSelectDirect}
					className={cn(
						"w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
						chatMode === "direct"
							? "bg-[var(--mode-active-bg)]"
							: "hover:bg-[var(--mode-hover-bg)]",
					)}
					style={{
						// @ts-expect-error CSS custom properties
						"--mode-active-bg": token.colorPrimaryBg,
						"--mode-hover-bg": token.colorFillTertiary,
					}}
				>
					<span
						className="w-7 h-7 flex items-center justify-center rounded-md"
						style={{
							backgroundColor: token.colorPrimaryBg,
							color: token.colorPrimary,
						}}
					>
						<RobotOutlined />
					</span>
					<div className="flex flex-col items-start">
						<span
							className="text-[13px] font-medium"
							style={{ color: token.colorText }}
						>
							{t("chatMode.direct", "直聊", { ns: "chat" })}
						</span>
					</div>
					{/* MCP status indicator */}
					{mcpToolCount > 0 && (
						<span
							className="ml-auto flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
							style={{
								backgroundColor: token.colorInfoBg,
								color: token.colorInfo,
							}}
						>
							<ApiOutlined className="text-[10px]" />
							{t(
								"chatMode.mcpStatus",
								"{{toolCount}} tools / {{serverCount}} servers",
								{
									ns: "chat",
									toolCount: mcpToolCount,
									serverCount: mcpServerCount,
								},
							)}
						</span>
					)}
					{chatMode === "direct" && (
						<span
							className={cn(
								"w-1.5 h-1.5 rounded-full",
								mcpToolCount > 0 ? "" : "ml-auto",
							)}
							style={{ backgroundColor: token.colorPrimary }}
						/>
					)}
				</button>

				{/* Agent mode */}
				<button
					type="button"
					onClick={handleSelectAgent}
					className={cn(
						"w-full flex items-center gap-3 px-3 py-2.5 transition-colors",
						chatMode === "agent"
							? "bg-[var(--mode-active-bg)]"
							: "hover:bg-[var(--mode-hover-bg)]",
					)}
					style={{
						// @ts-expect-error CSS custom properties
						"--mode-active-bg": token.colorPrimaryBg,
						"--mode-hover-bg": token.colorFillTertiary,
					}}
				>
					<span
						className="w-7 h-7 flex items-center justify-center rounded-md"
						style={{
							backgroundColor: token.colorWarningBg,
							color: token.colorWarning,
						}}
					>
						<ThunderboltOutlined />
					</span>
					<div className="flex flex-col items-start">
						<span
							className="text-[13px] font-medium"
							style={{ color: token.colorText }}
						>
							{t("chatMode.agent", "Agent", { ns: "chat" })}
						</span>
						<span
							className="text-[10px]"
							style={{ color: token.colorTextQuaternary }}
						>
							{t("chatMode.agentDesc", "Claude Agent SDK", { ns: "chat" })}
						</span>
					</div>
					{chatMode === "agent" && (
						<span
							className="ml-auto w-1.5 h-1.5 rounded-full"
							style={{ backgroundColor: token.colorPrimary }}
						/>
					)}
				</button>
			</div>

			{/* Footer */}
			<div
				className="flex items-center justify-end px-3 py-1.5"
				style={{
					borderTop: `1px solid ${token.colorBorderSecondary}`,
				}}
			>
				<div
					className="flex items-center gap-1.5 text-[10px]"
					style={{ color: token.colorTextQuaternary }}
				>
					<span
						className="px-1 py-0.5 rounded"
						style={{ backgroundColor: token.colorFillTertiary }}
					>
						ESC
					</span>
					<span>{t("chatMode.close", "关闭", { ns: "chat" })}</span>
				</div>
			</div>
		</div>
	);
}
