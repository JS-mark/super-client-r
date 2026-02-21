import { useCallback, useEffect, useRef } from "react";
import type { ShortcutScope } from "../stores/shortcutStore";
import {
	getShortcutFromEvent,
	normalizeShortcut,
	useShortcutStore,
} from "../stores/shortcutStore";

// 快捷键处理器类型
type ShortcutHandler = (event: KeyboardEvent) => void | boolean;

// 快捷键处理器映射
interface ShortcutHandlers {
	[shortcutId: string]: ShortcutHandler;
}

// 检查元素是否可输入
function isInputElement(element: HTMLElement): boolean {
	const tagName = element.tagName.toLowerCase();
	const editable = element.getAttribute("contenteditable");
	return (
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		editable === "true" ||
		editable === ""
	);
}

// 获取元素的作用域
function getElementScope(element: HTMLElement): ShortcutScope {
	if (isInputElement(element)) return "input";
	// 可以根据需要添加更多判断逻辑
	return "global";
}

/**
 * 全局快捷键钩子
 * @param handlers 快捷键处理器映射
 * @param activeScope 当前活动的作用域
 */
export function useGlobalShortcuts(
	handlers: ShortcutHandlers,
	activeScope: ShortcutScope = "global",
) {
	const {
		shortcuts,
		globalEnabled,
		isRecording,
		recordingShortcutId,
		stopRecording,
	} = useShortcutStore();
	const handlersRef = useRef(handlers);

	// 保持处理器引用最新
	useEffect(() => {
		handlersRef.current = handlers;
	}, [handlers]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// 如果正在录制快捷键，记录按键并返回
			if (isRecording && recordingShortcutId) {
				event.preventDefault();
				const shortcutKey = getShortcutFromEvent(event);
				if (shortcutKey) {
					const { updateShortcut, checkConflict } = useShortcutStore.getState();

					// 检查冲突
					const conflict = checkConflict(shortcutKey, recordingShortcutId);
					if (conflict) {
						// 触发冲突事件，让 UI 显示警告
						window.dispatchEvent(
							new CustomEvent("shortcut-conflict", {
								detail: {
									shortcutId: recordingShortcutId,
									conflictWith: conflict,
								},
							}),
						);
						// 不保存冲突的快捷键，保持录制状态让用户重试
						return;
					}

					updateShortcut(recordingShortcutId, shortcutKey);
					stopRecording();
				}
				return;
			}

			// 如果全局禁用，跳过快捷键处理
			if (!globalEnabled) return;

			// 正常处理快捷键
			const shortcutKey = normalizeShortcut(getShortcutFromEvent(event));
			if (!shortcutKey) return;

			// 查找匹配的快捷键
			const matchedShortcut = shortcuts.find((s) => {
				if (!s.enabled) return false;
				const normalizedCurrentKey = normalizeShortcut(s.currentKey);
				return normalizedCurrentKey === shortcutKey;
			});

			if (!matchedShortcut) return;

			// 检查作用域
			const target = event.target as HTMLElement;
			const elementScope = getElementScope(target);
			const shortcutScope = matchedShortcut.scope;

			// global 和 navigation 快捷键总是生效（不受 activeScope 限制）
			const alwaysActive =
				shortcutScope === "global" || shortcutScope === "navigation";

			// 其他作用域（chat、input）需要与 activeScope 匹配
			const scopeMatches = alwaysActive || shortcutScope === activeScope;

			if (!scopeMatches) return;

			// 输入框中的快捷键需要特殊处理
			if (elementScope === "input" && !alwaysActive) {
				// 只允许 input 作用域的快捷键在输入框中触发
				if (shortcutScope !== "input") return;
			}

			const handler = handlersRef.current[matchedShortcut.id];
			if (handler) {
				const result = handler(event);
				if (result !== false) {
					event.preventDefault();
				}
			}
		},
		[
			shortcuts,
			globalEnabled,
			isRecording,
			recordingShortcutId,
			stopRecording,
			activeScope,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);
}

/**
 * 录制快捷键钩子
 * @param onRecord 录制完成回调
 */
export function useShortcutRecorder(onRecord?: (key: string) => void) {
	const { isRecording, recordingShortcutId, startRecording, stopRecording } =
		useShortcutStore();
	const onRecordRef = useRef(onRecord);

	useEffect(() => {
		onRecordRef.current = onRecord;
	}, [onRecord]);

	const start = useCallback(
		(shortcutId: string) => {
			startRecording(shortcutId);
		},
		[startRecording],
	);

	const stop = useCallback(() => {
		stopRecording();
	}, [stopRecording]);

	return {
		isRecording,
		recordingShortcutId,
		start,
		stop,
	};
}

/**
 * 获取格式化的快捷键显示
 */
export function useFormattedShortcut(key: string): string {
	const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
	return formatShortcutDisplay(key, isMac);
}

/**
 * 格式化快捷键显示
 */
export function formatShortcutDisplay(key: string, isMac: boolean): string {
	const parts = key.toLowerCase().split("+");
	return parts
		.map((part) => {
			switch (part) {
				case "mod":
					return isMac ? "⌘" : "Ctrl";
				case "alt":
					return isMac ? "⌥" : "Alt";
				case "shift":
					return isMac ? "⇧" : "Shift";
				case "enter":
					return "↵";
				case "escape":
				case "esc":
					return isMac ? "⎋" : "Esc";
				case "delete":
				case "del":
					return isMac ? "⌫" : "Del";
				case "tab":
					return isMac ? "⇥" : "Tab";
				case "arrowup":
					return "↑";
				case "arrowdown":
					return "↓";
				case "arrowleft":
					return "←";
				case "arrowright":
					return "→";
				default:
					return part.charAt(0).toUpperCase() + part.slice(1);
			}
		})
		.join(isMac ? " " : " + ");
}
