import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { theme } from "antd";
import { useSidebarLayoutStore } from "../../stores/sidebarLayoutStore";

interface SidebarResizeHandleProps {
	currentWidth: number;
	onWidthChange: (next: number) => void;
}

/**
 * SidebarResizeHandle — 8px transparent hit area sitting flush with the
 * sidebar's right edge. Visual feedback uses a 1px vertical pin that fades
 * in on hover and switches to the primary tint while dragging. No hard line
 * at rest so the chrome stays clean.
 */
export const SidebarResizeHandle: React.FC<SidebarResizeHandleProps> = ({
	currentWidth,
	onWidthChange,
}) => {
	const { token } = theme.useToken();
	const resetWidth = useSidebarLayoutStore((s) => s.resetWidth);
	const [hovered, setHovered] = useState(false);
	const [dragging, setDragging] = useState(false);
	const draggingRef = useRef(false);
	const startXRef = useRef(0);
	const startWidthRef = useRef(0);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			e.preventDefault();
			draggingRef.current = true;
			setDragging(true);
			startXRef.current = e.clientX;
			startWidthRef.current = currentWidth;
			document.body.style.cursor = "col-resize";
			document.body.style.userSelect = "none";
		},
		[currentWidth],
	);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!draggingRef.current) return;
			const next = startWidthRef.current + (e.clientX - startXRef.current);
			onWidthChange(next);
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
	}, [onWidthChange]);

	const handleDoubleClick = useCallback(() => {
		resetWidth();
	}, [resetWidth]);

	const active = hovered || dragging;
	const pinColor = dragging ? token.colorPrimary : token.colorBorder;
	const glowColor = dragging ? token.colorPrimary : token.colorBorder;

	return (
		<div
			role="separator"
			aria-orientation="vertical"
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			title="拖拽调整宽度，双击恢复默认"
			style={{
				position: "absolute",
				top: 0,
				right: -7,
				bottom: 0,
				width: 8,
				cursor: "col-resize",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				zIndex: 10,
				// @ts-expect-error - WebkitAppRegion is a valid CSS property in Electron
				WebkitAppRegion: "no-drag",
			}}
			data-testid="sidebar-resize-handle"
		>
			<div
				style={{
					width: 2,
					height: "100%",
					borderRadius: 2,
					background: `linear-gradient(to bottom, ${pinColor}99 0%, ${pinColor} 6%, ${pinColor} 94%, ${pinColor}99 100%)`,
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
