import { forwardRef } from "react";
import "@xterm/xterm/css/xterm.css";
import "./DeviceTerminal.css";
import type { CommandResult } from "@/types/electron";
import { useDeviceTerminalSession } from "./useDeviceTerminalSession";

export interface DeviceTerminalProps {
	deviceId: string;
	disabled?: boolean;
	onCommand: (command: string, timeout?: number) => Promise<CommandResult>;
}

export interface DeviceTerminalRef {
	clear: () => void;
	focus: () => void;
}

export const DeviceTerminal = forwardRef<
	DeviceTerminalRef,
	DeviceTerminalProps
>(function DeviceTerminal({ deviceId, disabled = false, onCommand }, ref) {
	const containerRef = useDeviceTerminalSession(
		{ deviceId, disabled, onCommand },
		ref,
	);

	return (
		<div
			ref={containerRef}
			className="w-full h-full rounded-lg overflow-hidden"
			style={{ minHeight: 380 }}
		/>
	);
});
