import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { theme } from "antd";

interface TerminalPanelResizerProps {
	currentHeight: number;
	onHeightChange: (next: number) => void;
	onResetHeight?: () => void;
}

/**
 * Horizontal twin of {@link SidebarResizeHandle}: an 8px hit area sitting on
 * the panel's top edge, dragging upward grows the panel. Mirrors the visual
 * language of the sidebar handle (1px hairline, hover/drag tinting).
 */
export const TerminalPanelResizer: React.FC<TerminalPanelResizerProps> = ({
	currentHeight,
	onHeightChange,
	onResetHeight,
}) => {
	const { token } = theme.useToken();
	const [hovered, setHovered] = useState(false);
	const [dragging, setDragging] = useState(false);
	const draggingRef = useRef(false);
	const startYRef = useRef(0);
	const startHeightRef = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.preventDefault();
			draggingRef.current = true;
			setDragging(true);
			startYRef.current = e.clientY;
			startHeightRef.current = currentHeight;
			document.body.style.cursor = "row-resize";
			document.body.style.userSelect = "none";
		},
		[currentHeight],
	);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!draggingRef.current) return;
			// dragging up grows the panel
			const next = startHeightRef.current - (e.clientY - startYRef.current);
			onHeightChange(next);
		};
		const onUp = () => {
			if (!draggingRef.current) return;
			draggingRef.current = false;
			setDragging(false);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
		};
	}, [onHeightChange]);

	const handleDoubleClick = useCallback(() => {
		onResetHeight?.();
	}, [onResetHeight]);

	const active = hovered || dragging;
	const pinColor = dragging ? token.colorPrimary : token.colorBorder;
	const glowColor = dragging ? token.colorPrimary : token.colorBorder;

	return (
		<div
			role="separator"
			aria-orientation="horizontal"
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="拖拽调整高度，双击恢复默认"
			style={{
				position: "absolute",
				top: -4,
				left: 0,
				right: 0,
				height: 8,
				cursor: "row-resize",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				zIndex: 10,
				// @ts-expect-error - WebkitAppRegion is a valid CSS property in Electron
				WebkitAppRegion: "no-drag",
			}}
			data-testid="terminal-panel-resize-handle"
		>
			<div
				style={{
					height: 2,
					width: "100%",
					borderRadius: 2,
					background: `linear-gradient(to right, ${pinColor}99 0%, ${pinColor} 6%, ${pinColor} 94%, ${pinColor}99 100%)`,
					opacity: active ? 1 : 0,
					boxShadow: active
						? `0 0 8px ${glowColor}66, 0 0 2px ${glowColor}99`
						: "none",
					transition:
						"opacity 180ms ease, box-shadow 180ms ease, background 180ms ease",
				}}
			/>
		</div>
	);
};
