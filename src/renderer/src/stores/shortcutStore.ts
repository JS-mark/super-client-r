import { create } from "zustand";
import { persist } from "zustand/middleware";

// 快捷键作用域
export type ShortcutScope = "global" | "chat" | "navigation" | "input";

// 快捷键定义
export interface Shortcut {
	id: string;
	name: string;
	nameKey: string; // i18n key
	description: string;
	descriptionKey: string; // i18n key
	scope: ShortcutScope;
	defaultKey: string;
	currentKey: string;
	enabled: boolean;
}

// 快捷键状态
interface ShortcutState {
	shortcuts: Shortcut[];
	globalEnabled: boolean;
	isRecording: boolean;
	recordingShortcutId: string | null;
}

// 快捷键动作
interface ShortcutActions {
	// 初始化默认快捷键
	initDefaultShortcuts: () => void;
	// 更新快捷键
	updateShortcut: (id: string, key: string) => void;
	// 重置快捷键为默认值
	resetShortcut: (id: string) => void;
	// 重置所有快捷键
	resetAllShortcuts: () => void;
	// 全局启用/禁用
	toggleGlobalEnabled: () => void;
	// 启用/禁用快捷键
	toggleShortcut: (id: string) => void;
	// 检查快捷键冲突
	checkConflict: (key: string, excludeId?: string) => Shortcut | undefined;
	// 开始录制快捷键
	startRecording: (shortcutId: string) => void;
	// 停止录制快捷键
	stopRecording: () => void;
	// 获取快捷键
	getShortcut: (id: string) => Shortcut | undefined;
	// 获取指定作用域的快捷键
	getShortcutsByScope: (scope: ShortcutScope) => Shortcut[];
}

// 默认快捷键配置
export const DEFAULT_SHORTCUTS: Omit<Shortcut, "currentKey">[] = [
	// 全局快捷键
	{
		id: "new-chat",
		name: "新建对话",
		nameKey: "newChat",
		description: "创建一个新的对话",
		descriptionKey: "newChatDesc",
		scope: "global",
		defaultKey: "mod+n",
		enabled: true,
	},
	{
		id: "quick-search",
		name: "快速搜索",
		nameKey: "quickSearch",
		description: "打开快速搜索面板",
		descriptionKey: "quickSearchDesc",
		scope: "global",
		defaultKey: "mod+k",
		enabled: true,
	},
	{
		id: "toggle-sidebar",
		name: "切换侧边栏",
		nameKey: "toggleSidebar",
		description: "显示/隐藏侧边栏",
		descriptionKey: "toggleSidebarDesc",
		scope: "global",
		defaultKey: "mod+b",
		enabled: true,
	},
	{
		id: "open-settings",
		name: "打开设置",
		nameKey: "openSettings",
		description: "打开设置页面",
		descriptionKey: "openSettingsDesc",
		scope: "global",
		defaultKey: "mod+,",
		enabled: true,
	},
	{
		id: "open-bookmarks",
		name: "打开收藏",
		nameKey: "openBookmarks",
		description: "打开收藏页面",
		descriptionKey: "openBookmarksDesc",
		scope: "global",
		defaultKey: "mod+shift+b",
		enabled: true,
	},
	// 对话页面快捷键
	{
		id: "send-message",
		name: "发送消息",
		nameKey: "sendMessage",
		description: "发送当前输入的消息",
		descriptionKey: "sendMessageDesc",
		scope: "chat",
		defaultKey: "enter",
		enabled: true,
	},
	{
		id: "new-line",
		name: "换行",
		nameKey: "newLine",
		description: "在输入框中换行",
		descriptionKey: "newLineDesc",
		scope: "input",
		defaultKey: "shift+enter",
		enabled: true,
	},
	{
		id: "clear-chat",
		name: "清空对话",
		nameKey: "clearChat",
		description: "清空当前对话内容",
		descriptionKey: "clearChatDesc",
		scope: "chat",
		defaultKey: "mod+shift+k",
		enabled: true,
	},
	{
		id: "focus-input",
		name: "聚焦输入框",
		nameKey: "focusInput",
		description: "将焦点移动到输入框",
		descriptionKey: "focusInputDesc",
		scope: "chat",
		defaultKey: "mod+i",
		enabled: true,
	},
	// 导航快捷键
	{
		id: "go-to-chat",
		name: "前往对话",
		nameKey: "goToChat",
		description: "导航到对话页面",
		descriptionKey: "goToChatDesc",
		scope: "navigation",
		defaultKey: "mod+1",
		enabled: true,
	},
	{
		id: "go-to-models",
		name: "前往模型",
		nameKey: "goToModels",
		description: "导航到模型页面",
		descriptionKey: "goToModelsDesc",
		scope: "navigation",
		defaultKey: "mod+2",
		enabled: true,
	},
	{
		id: "go-to-skills",
		name: "前往技能",
		nameKey: "goToSkills",
		description: "导航到技能页面",
		descriptionKey: "goToSkillsDesc",
		scope: "navigation",
		defaultKey: "mod+3",
		enabled: true,
	},
	{
		id: "go-to-plugins",
		name: "前往插件",
		nameKey: "goToPlugins",
		description: "导航到插件页面",
		descriptionKey: "goToPluginsDesc",
		scope: "navigation",
		defaultKey: "mod+4",
		enabled: true,
	},
	{
		id: "go-to-bookmarks",
		name: "前往收藏",
		nameKey: "goToBookmarks",
		description: "导航到收藏页面",
		descriptionKey: "goToBookmarksDesc",
		scope: "navigation",
		defaultKey: "mod+5",
		enabled: true,
	},
];

// 将快捷键字符串标准化（例如：Cmd+K -> mod+k）
export function normalizeShortcut(key: string): string {
	return key
		.toLowerCase()
		.replace(/cmd|command|ctrl/g, "mod")
		.replace(/opt|option|alt/g, "alt")
		.replace(/shift/g, "shift")
		.replace(/\s+/g, "")
		.split(/[+-]/)
		.sort((a, b) => {
			// 确保修饰键顺序：mod, alt, shift, 其他键
			const order = ["mod", "alt", "shift"];
			const aIndex = order.indexOf(a);
			const bIndex = order.indexOf(b);
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			return a.localeCompare(b);
		})
		.join("+");
}

// 格式化快捷键显示（mod+k -> ⌘K 或 Ctrl+K）
export function formatShortcut(key: string, isMac: boolean): string {
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
		.join(" + ");
}

// 检查是否为修饰键
export function isModifierKey(key: string): boolean {
	return ["mod", "alt", "shift", "ctrl", "cmd", "command", "option", "opt"].includes(
		key.toLowerCase()
	);
}

// 从键盘事件获取快捷键字符串
export function getShortcutFromEvent(e: KeyboardEvent): string {
	const parts: string[] = [];

	if (e.metaKey || e.ctrlKey) parts.push("mod");
	if (e.altKey) parts.push("alt");
	if (e.shiftKey) parts.push("shift");

	const key = e.key.toLowerCase();
	if (key !== "meta" && key !== "control" && key !== "alt" && key !== "shift") {
		parts.push(key);
	}

	return parts.join("+");
}

export const useShortcutStore = create<ShortcutState & ShortcutActions>()(
	persist(
		(set, get) => ({
			shortcuts: [],
			globalEnabled: true,
			isRecording: false,
			recordingShortcutId: null,

			initDefaultShortcuts: () => {
				const currentShortcuts = get().shortcuts;
				if (currentShortcuts.length === 0) {
					const shortcuts = DEFAULT_SHORTCUTS.map((s) => ({
						...s,
						currentKey: s.defaultKey,
					}));
					set({ shortcuts });
				}
			},

			updateShortcut: (id, key) => {
				const normalizedKey = normalizeShortcut(key);
				set((state) => ({
					shortcuts: state.shortcuts.map((s) =>
						s.id === id ? { ...s, currentKey: normalizedKey } : s
					),
				}));
			},

			resetShortcut: (id) => {
				set((state) => ({
					shortcuts: state.shortcuts.map((s) =>
						s.id === id ? { ...s, currentKey: s.defaultKey } : s
					),
				}));
			},

			resetAllShortcuts: () => {
				set((state) => ({
					shortcuts: state.shortcuts.map((s) => ({
						...s,
						currentKey: s.defaultKey,
						enabled: true,
					})),
				}));
			},

			toggleGlobalEnabled: () => {
				set((state) => ({ globalEnabled: !state.globalEnabled }));
			},

			toggleShortcut: (id) => {
				set((state) => ({
					shortcuts: state.shortcuts.map((s) =>
						s.id === id ? { ...s, enabled: !s.enabled } : s
					),
				}));
			},

			checkConflict: (key, excludeId) => {
				const normalizedKey = normalizeShortcut(key);
				return get().shortcuts.find(
					(s) =>
						s.id !== excludeId &&
						s.enabled &&
						normalizeShortcut(s.currentKey) === normalizedKey
				);
			},

			startRecording: (shortcutId) => {
				set({ isRecording: true, recordingShortcutId: shortcutId });
			},

			stopRecording: () => {
				set({ isRecording: false, recordingShortcutId: null });
			},

			getShortcut: (id) => {
				return get().shortcuts.find((s) => s.id === id);
			},

			getShortcutsByScope: (scope) => {
				return get().shortcuts.filter((s) => s.scope === scope);
			},
		}),
		{
			name: "shortcut-storage",
			partialize: (state) => ({ shortcuts: state.shortcuts, globalEnabled: state.globalEnabled }),
			onRehydrateStorage: () => (state) => {
				if (!state) return;

				if (state.shortcuts.length === 0) {
					// No persisted shortcuts — initialize all defaults
					state.initDefaultShortcuts();
				} else {
					// Build a map of defaults keyed by id for quick lookup
					const defaultsById = new Map(
						DEFAULT_SHORTCUTS.map((d) => [d.id, d]),
					);

					// Migrate persisted shortcuts: sync nameKey/descriptionKey
					// from defaults and strip legacy "shortcuts." prefix
					const migrated = state.shortcuts.map((s) => {
						const def = defaultsById.get(s.id);
						if (def) {
							return {
								...s,
								nameKey: def.nameKey,
								descriptionKey: def.descriptionKey,
							};
						}
						// Legacy shortcut with "shortcuts." prefix
						return {
							...s,
							nameKey: s.nameKey.replace(/^shortcuts\./, ""),
							descriptionKey: s.descriptionKey.replace(/^shortcuts\./, ""),
						};
					});

					// Merge any new defaults that were added since last persist
					const existingIds = new Set(migrated.map((s) => s.id));
					const missing = DEFAULT_SHORTCUTS.filter(
						(d) => !existingIds.has(d.id),
					).map((d) => ({ ...d, currentKey: d.defaultKey }));

					useShortcutStore.setState({
						shortcuts: [...migrated, ...missing],
					});
				}
			},
		}
	)
);
