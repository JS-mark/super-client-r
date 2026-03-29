/**
 * 延迟注入的服务实例集中管理
 *
 * 某些服务在 main.ts 中异步初始化后才注入到 IPC handler。
 * 集中管理避免散布在各个 handler 文件中。
 */

import type { BrowserWindow } from "electron";
import type { RemoteControlEventService } from "../services/remote/RemoteControlEventService";
import type { RemoteChatBridge } from "../services/remote-chat/RemoteChatBridge";

// ─── IM Bot Service ──────────────────────────

let imbotServiceInstance: any = null;

export function setIMBotService(service: any): void {
	imbotServiceInstance = service;
}

export function getIMBotService(): any {
	if (!imbotServiceInstance) {
		throw new Error("IMBotService not initialized. Call setIMBotService first.");
	}
	return imbotServiceInstance;
}

// ─── Remote Device Service ───────────────────

let remoteDeviceServiceInstance: any = null;

export function setRemoteDeviceService(service: any): void {
	remoteDeviceServiceInstance = service;
}

export function getRemoteDeviceService(): any {
	if (!remoteDeviceServiceInstance) {
		throw new Error(
			"RemoteDeviceService not initialized. Call setRemoteDeviceService first.",
		);
	}
	return remoteDeviceServiceInstance;
}

// ─── Remote Control Event Service ────────────

let remoteControlEventService: RemoteControlEventService | null = null;

export function setRemoteControlEventService(
	service: RemoteControlEventService,
): void {
	remoteControlEventService = service;
}

export function getRemoteControlEventService(): RemoteControlEventService {
	if (!remoteControlEventService) {
		throw new Error(
			"RemoteControlEventService not initialized. Call setRemoteControlEventService first.",
		);
	}
	return remoteControlEventService;
}

// ─── Remote Chat Bridge ─────────────────────

let remoteChatBridgeInstance: RemoteChatBridge | null = null;

export function setRemoteChatBridge(bridge: RemoteChatBridge): void {
	remoteChatBridgeInstance = bridge;
}

export function getRemoteChatBridge(): RemoteChatBridge {
	if (!remoteChatBridgeInstance) {
		throw new Error(
			"RemoteChatBridge not initialized. Call setRemoteChatBridge first.",
		);
	}
	return remoteChatBridgeInstance;
}

// ─── Floating Window ─────────────────────────

let floatingWindow: BrowserWindow | null = null;
let floatWidgetVisible = false;

export function setFloatingWindow(window: BrowserWindow | null): void {
	floatingWindow = window;
}

export function getFloatingWindow(): BrowserWindow | null {
	return floatingWindow;
}

export function getFloatWidgetVisible(): boolean {
	return floatWidgetVisible;
}

export function setFloatWidgetVisible(visible: boolean): void {
	floatWidgetVisible = visible;
}

// ─── Log Viewer ──────────────────────────────

let openViewerCallback: (() => void) | null = null;

export function setLogViewerOpener(callback: () => void): void {
	openViewerCallback = callback;
}

export function getLogViewerOpener(): (() => void) | null {
	return openViewerCallback;
}
