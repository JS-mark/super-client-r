/**
 * Log Viewer Page - Standalone full-page log viewer
 * Loaded in a separate BrowserWindow via /#/log-viewer route
 * Features custom titlebar with window controls (no native traffic lights)
 */

import {
	CloseOutlined,
	FullscreenExitOutlined,
	FullscreenOutlined,
	MinusOutlined,
} from "@ant-design/icons";
import { theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogDetailDrawer } from "../components/logviewer/LogDetailDrawer";
import { LogStatsPanel } from "../components/logviewer/LogStatsPanel";
import { LogViewerTable } from "../components/logviewer/LogViewerTable";
import { LogViewerToolbar } from "../components/logviewer/LogViewerToolbar";
import { useLogViewerStore } from "../stores/logViewerStore";

const { useToken } = theme;

const LogViewerPage: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const refresh = useLogViewerStore((s) => s.refresh);
	const { token } = useToken();
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useEffect(() => {
		window.electron.window.isMaximized().then((response) => {
			if (response.success && response.data !== undefined) {
				setIsMaximized(response.data);
			}
		});
		const unsubscribe = window.electron.window.onMaximizeChange(
			(maximized: boolean) => {
				setIsMaximized(maximized);
			},
		);
		return unsubscribe;
	}, []);

	const handleMinimize = useCallback(() => {
		window.electron.window.minimize();
	}, []);

	const handleMaximize = useCallback(() => {
		window.electron.window.maximize();
	}, []);

	const handleClose = useCallback(() => {
		window.electron.window.close();
	}, []);

	return (
		<div
			className="h-screen flex flex-col overflow-hidden"
			style={{ background: token.colorBgLayout }}
		>
			{/* Custom title bar */}
			<div
				className="h-11 flex items-center justify-between px-4 select-none shrink-0"
				style={
					{
						WebkitAppRegion: "drag",
						background: token.colorBgContainer,
						borderBottom: `1px solid ${token.colorBorderSecondary}`,
					} as React.CSSProperties
				}
			>
				{/* Left: Title with icon */}
				<div className="flex items-center gap-2.5">
					<div
						className="w-6 h-6 rounded-md flex items-center justify-center text-xs"
						style={{
							background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorPrimaryActive})`,
							color: "#fff",
						}}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
							<polyline points="14 2 14 8 20 8" />
							<line x1="16" y1="13" x2="8" y2="13" />
							<line x1="16" y1="17" x2="8" y2="17" />
							<polyline points="10 9 9 9 8 9" />
						</svg>
					</div>
					<span
						className="text-[13px] font-semibold tracking-tight"
						style={{ color: token.colorText }}
					>
						{t("title")}
					</span>
				</div>

				{/* Right: Window controls */}
				<div
					className="flex items-center gap-1"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<WindowControlButton
						onClick={handleMinimize}
						hoverBg={token.colorFillSecondary}
					>
						<MinusOutlined style={{ fontSize: 11 }} />
					</WindowControlButton>
					<WindowControlButton
						onClick={handleMaximize}
						hoverBg={token.colorFillSecondary}
					>
						{isMaximized ? (
							<FullscreenExitOutlined style={{ fontSize: 11 }} />
						) : (
							<FullscreenOutlined style={{ fontSize: 11 }} />
						)}
					</WindowControlButton>
					<WindowControlButton
						onClick={handleClose}
						hoverBg="#e81123"
						hoverColor="#fff"
						isClose
					>
						<CloseOutlined style={{ fontSize: 11 }} />
					</WindowControlButton>
				</div>
			</div>

			{/* Main content area */}
			<div className="flex-1 flex flex-col overflow-hidden p-4 gap-3">
				{/* Stats panel */}
				<LogStatsPanel />

				{/* Toolbar */}
				<LogViewerToolbar />

				{/* Table - takes remaining space */}
				<div className="flex-1 overflow-hidden">
					<LogViewerTable />
				</div>
			</div>

			{/* Detail drawer */}
			<LogDetailDrawer />
		</div>
	);
};

/** Minimal window control button with hover state */
function WindowControlButton({
	onClick,
	hoverBg,
	hoverColor,
	isClose,
	children,
}: {
	onClick: () => void;
	hoverBg: string;
	hoverColor?: string;
	isClose?: boolean;
	children: React.ReactNode;
}) {
	const { token } = useToken();
	const [hovered, setHovered] = useState(false);

	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			className="w-8 h-7 flex items-center justify-center rounded-md transition-colors duration-100"
			style={{
				background: hovered ? hoverBg : "transparent",
				color:
					hovered && hoverColor
						? hoverColor
						: isClose && hovered
							? "#fff"
							: token.colorTextSecondary,
			}}
		>
			{children}
		</button>
	);
}

export default LogViewerPage;
