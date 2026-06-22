/**
 * Project / Session 重设计 C-2 — useSessionListStore
 *
 * Renderer 侧的 session 元列表缓存。按 bucket 分组：
 *   - `casual: SessionMeta[]` —— projectId === null 的会话
 *   - `byProject: Record<projectId, SessionMeta[]>` —— 每个 project 一个 list
 *
 * Main 是 source of truth；这里 mirror。所有 mutate 走 IPC，写完把返回的
 * SessionMeta 同步进 store。
 *
 * 跟旧 `useChatStore.conversations` 不同：旧 store 用扁平数组带 workspaceId 字段
 * 来表达归属；新 store 用嵌套 bucket 直接表达。Phase D 由消费者翻读。
 */

import { create } from "zustand";
import type { ChatMode, SessionMeta } from "@super-client/shared-types/project";

interface SessionListState {
	casual: SessionMeta[];
	byProject: Record<string, SessionMeta[]>;
	currentSessionId: string | null;
	loaded: boolean;

	loadCasual: () => Promise<void>;
	loadProject: (projectId: string) => Promise<void>;

	create: (input: {
		projectId: string | null;
		name?: string;
		chatMode?: ChatMode;
	}) => Promise<SessionMeta | null>;

	delete: (sessionId: string) => Promise<void>;
	rename: (sessionId: string, name: string) => Promise<void>;
	updateMeta: (sessionId: string, patch: Partial<SessionMeta>) => Promise<void>;

	setCurrent: (sessionId: string | null) => void;

	// 选择器
	getById: (sessionId: string) => SessionMeta | undefined;
	getCurrent: () => SessionMeta | null;
	getForBucket: (projectId: string | null) => SessionMeta[];
}

export const useSessionListStore = create<SessionListState>()((set, get) => ({
	casual: [],
	byProject: {},
	currentSessionId: null,
	loaded: false,

	loadCasual: async () => {
		try {
			const res = await window.electron.sessions.list(null);
			if (res.success && res.data) {
				set({ casual: res.data, loaded: true });
			} else {
				set({ loaded: true });
			}
		} catch (err) {
			console.warn("[sessionListStore] loadCasual failed:", err);
			set({ loaded: true });
		}
	},

	loadProject: async (projectId) => {
		try {
			const res = await window.electron.sessions.list(projectId);
			if (res.success && res.data) {
				set((state) => ({
					byProject: { ...state.byProject, [projectId]: res.data ?? [] },
					loaded: true,
				}));
			} else {
				set({ loaded: true });
			}
		} catch (err) {
			console.warn(`[sessionListStore] loadProject(${projectId}) failed:`, err);
			set({ loaded: true });
		}
	},

	create: async (input) => {
		try {
			const res = await window.electron.sessions.create(input);
			if (res.success && res.data) {
				const meta = res.data;
				upsertInBucket(meta);
				set({ currentSessionId: meta.id });
				return meta;
			}
			return null;
		} catch (err) {
			console.warn("[sessionListStore] create failed:", err);
			return null;
		}
	},

	delete: async (sessionId) => {
		const target = get().getById(sessionId);
		if (!target) return;
		try {
			const res = await window.electron.sessions.delete(sessionId);
			if (!res.success) return;
			removeFromBucket(target);
			if (get().currentSessionId === sessionId) {
				set({ currentSessionId: null });
			}
		} catch (err) {
			console.warn("[sessionListStore] delete failed:", err);
		}
	},

	rename: async (sessionId, name) => {
		try {
			const res = await window.electron.sessions.rename(sessionId, name);
			if (res.success && res.data) {
				upsertInBucket(res.data);
			}
		} catch (err) {
			console.warn("[sessionListStore] rename failed:", err);
		}
	},

	updateMeta: async (sessionId, patch) => {
		try {
			const res = await window.electron.sessions.updateMeta(sessionId, patch);
			if (res.success && res.data) {
				upsertInBucket(res.data);
			}
		} catch (err) {
			console.warn("[sessionListStore] updateMeta failed:", err);
		}
	},

	setCurrent: (sessionId) => {
		set({ currentSessionId: sessionId });
	},

	getById: (sessionId) => {
		const { casual, byProject } = get();
		const fromCasual = casual.find((s) => s.id === sessionId);
		if (fromCasual) return fromCasual;
		for (const list of Object.values(byProject)) {
			const found = list.find((s) => s.id === sessionId);
			if (found) return found;
		}
		return undefined;
	},

	getCurrent: () => {
		const { currentSessionId } = get();
		if (!currentSessionId) return null;
		return get().getById(currentSessionId) ?? null;
	},

	getForBucket: (projectId) => {
		if (projectId === null) return get().casual;
		return get().byProject[projectId] ?? [];
	},
}));

// ─────────────────────────────────────────────────────────────────────
// 内部 helpers — 用 useSessionListStore.setState 直接操作，避免 set/get 类型耦合
// ─────────────────────────────────────────────────────────────────────

function upsertInBucket(meta: SessionMeta): void {
	useSessionListStore.setState((state) => {
		if (meta.projectId === null) {
			const without = state.casual.filter((s) => s.id !== meta.id);
			return { casual: [meta, ...without] };
		}
		const projectId = meta.projectId;
		const current = state.byProject[projectId] ?? [];
		const without = current.filter((s) => s.id !== meta.id);
		return {
			byProject: {
				...state.byProject,
				[projectId]: [meta, ...without],
			},
		};
	});
}

function removeFromBucket(meta: SessionMeta): void {
	useSessionListStore.setState((state) => {
		if (meta.projectId === null) {
			return { casual: state.casual.filter((s) => s.id !== meta.id) };
		}
		const projectId = meta.projectId;
		const list = state.byProject[projectId] ?? [];
		return {
			byProject: {
				...state.byProject,
				[projectId]: list.filter((s) => s.id !== meta.id),
			},
		};
	});
}
