/**
 * Project / Session 重设计 C-1 — useProjectStore
 *
 * Renderer 侧的 Project registry 缓存。Main 是 source of truth；这里只 mirror，
 * 写都通过 IPC 进 main，再把返回结果写回 store。
 *
 * 跟旧的 `useWorkspaceStore` 一样的角色但**只承担"项目"语义**，不再有
 * description / type / color / sessionIds 等遗产字段。
 *
 * Phase C-1 仅提供 store；消费者切换是 Phase D 的事。
 */

import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type {
	Project,
	ProjectSettings,
} from "@super-client/shared-types/project";
import { createLogger } from "../services/logService";

const log = createLogger("projectStore");

interface ProjectState {
	projects: Project[];
	currentProjectId: string | null;
	loaded: boolean;
	/** E-3: 项目级 ProjectSettings 缓存。未加载过的 projectId 不在此 map 中。 */
	settingsByProject: Record<string, ProjectSettings>;

	load: () => Promise<void>;
	add: (cwd: string, name?: string) => Promise<Project | null>;
	/** Open native directory picker and register the chosen path. Returns null on cancel. */
	pickAndAdd: (name?: string) => Promise<Project | null>;
	rename: (id: string, name: string) => Promise<void>;
	pin: (id: string, pinned: boolean) => Promise<void>;
	/** G-7: 把项目标记为"用户已看过首页"，幂等 */
	markFirstRunSeen: (id: string) => Promise<void>;
	/** F-3: 归档 / 取消归档项目（session 不动） */
	archive: (id: string, archived: boolean) => Promise<void>;
	/**
	 * F-3: 在源项目上 git worktree add，新工作树自动注册成独立项目。
	 * 失败抛错，调用方弹 toast；成功返回新 Project 并 upsert 到 store。
	 */
	createWorktree: (
		sourceId: string,
		opts: { worktreePath: string; branchName?: string },
	) => Promise<Project | null>;
	remove: (
		id: string,
		opts?: { keepFiles?: boolean },
	) => Promise<{ removed: boolean; orphan?: boolean } | null>;
	setCurrent: (id: string | null) => void;
	/** E-3: 拉项目设置并写入缓存。已存在则覆盖。 */
	loadSettings: (id: string) => Promise<ProjectSettings>;
	/** E-3: 写项目设置（merge），更新缓存。 */
	saveSettings: (
		id: string,
		patch: Partial<ProjectSettings>,
	) => Promise<ProjectSettings | null>;

	// 选择器
	getCurrent: () => Project | null;
	getById: (id: string) => Project | undefined;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
	projects: [],
	currentProjectId: null,
	loaded: false,
	settingsByProject: {},

	load: async () => {
		try {
			const res = await window.electron.projects.list();
			if (res.success && res.data) {
				set({ projects: res.data, loaded: true });
			} else {
				set({ loaded: true });
			}
		} catch (err) {
			log.warn("load failed", { error: err });
			set({ loaded: true });
		}
	},

	add: async (cwd, name) => {
		try {
			const res = await window.electron.projects.add(cwd, name);
			if (res.success && res.data) {
				const project = res.data;
				set((state) => {
					// upsert (idempotent — same cwd → same id)
					const without = state.projects.filter((p) => p.id !== project.id);
					return { projects: [...without, project] };
				});
				return project;
			}
			return null;
		} catch (err) {
			log.warn("add failed", { error: err });
			return null;
		}
	},

	pickAndAdd: async (name) => {
		try {
			const res = await window.electron.projects.pickAndAdd(name);
			if (!res.success) return null;
			const project = res.data;
			if (!project) return null; // user cancelled
			set((state) => {
				const without = state.projects.filter((p) => p.id !== project.id);
				return { projects: [...without, project] };
			});
			return project;
		} catch (err) {
			log.warn("pickAndAdd failed", { error: err });
			return null;
		}
	},

	rename: async (id, name) => {
		try {
			const res = await window.electron.projects.rename(id, name);
			if (res.success && res.data) {
				const updated = res.data;
				set((state) => ({
					projects: state.projects.map((p) => (p.id === id ? updated : p)),
				}));
			}
		} catch (err) {
			log.warn("rename failed", { error: err });
		}
	},

	pin: async (id, pinned) => {
		try {
			const res = await window.electron.projects.pin(id, pinned);
			if (res.success && res.data) {
				const updated = res.data;
				set((state) => ({
					projects: state.projects.map((p) => (p.id === id ? updated : p)),
				}));
			}
		} catch (err) {
			log.warn("pin failed", { error: err });
		}
	},

	markFirstRunSeen: async (id) => {
		try {
			const res = await window.electron.projects.markFirstRunSeen(id);
			if (res.success && res.data) {
				const updated = res.data;
				set((state) => ({
					projects: state.projects.map((p) => (p.id === id ? updated : p)),
				}));
			}
		} catch (err) {
			log.warn("markFirstRunSeen failed", { error: err });
		}
	},

	archive: async (id, archived) => {
		try {
			const res = await window.electron.projects.archive(id, archived);
			if (res.success && res.data) {
				const updated = res.data;
				set((state) => ({
					projects: state.projects.map((p) => (p.id === id ? updated : p)),
					// 归档当前项目时清掉 currentProjectId
					currentProjectId:
						archived && state.currentProjectId === id
							? null
							: state.currentProjectId,
				}));
			}
		} catch (err) {
			log.warn("archive failed", { error: err });
		}
	},

	createWorktree: async (sourceId, opts) => {
		try {
			const res = await window.electron.projects.createWorktree(sourceId, opts);
			if (!res.success || !res.data) {
				throw new Error(res.error ?? "createWorktree failed");
			}
			const project = res.data;
			set((state) => {
				const without = state.projects.filter((p) => p.id !== project.id);
				return { projects: [...without, project] };
			});
			return project;
		} catch (err) {
			log.warn("createWorktree failed", { error: err });
			throw err;
		}
	},

	remove: async (id, opts) => {
		try {
			const res = await window.electron.projects.remove(id, opts);
			if (res.success && res.data?.removed) {
				set((state) => ({
					projects: state.projects.filter((p) => p.id !== id),
					currentProjectId:
						state.currentProjectId === id ? null : state.currentProjectId,
				}));
			}
			return res.success && res.data ? res.data : null;
		} catch (err) {
			log.warn("remove failed", { error: err });
			return null;
		}
	},

	setCurrent: (id) => {
		set({ currentProjectId: id });
	},

	loadSettings: async (id) => {
		try {
			const res = await window.electron.projects.getSettings(id);
			const settings = res.success && res.data ? res.data : {};
			set((state) => ({
				settingsByProject: { ...state.settingsByProject, [id]: settings },
			}));
			return settings;
		} catch (err) {
			log.warn("loadSettings failed", { error: err });
			set((state) => ({
				settingsByProject: { ...state.settingsByProject, [id]: {} },
			}));
			return {};
		}
	},

	saveSettings: async (id, patch) => {
		try {
			const res = await window.electron.projects.saveSettings(id, patch);
			if (res.success && res.data) {
				set((state) => ({
					settingsByProject: {
						...state.settingsByProject,
						[id]: res.data as ProjectSettings,
					},
				}));
				return res.data;
			}
			return null;
		} catch (err) {
			log.warn("saveSettings failed", { error: err });
			return null;
		}
	},

	getCurrent: () => {
		const { projects, currentProjectId } = get();
		return projects.find((p) => p.id === currentProjectId) ?? null;
	},

	getById: (id) => {
		return get().projects.find((p) => p.id === id);
	},
}));

/**
 * E-3: 项目设置 hook —— 自动 lazy-load 并 mirror store。
 * projectId === null（普通对话）时直接返回 undefined，调用方应回退到 app 全局默认。
 */
export function useProjectSettings(
	projectId: string | null,
): ProjectSettings | undefined {
	const settings = useProjectStore((s) =>
		projectId ? s.settingsByProject[projectId] : undefined,
	);
	useEffect(() => {
		if (!projectId) return;
		if (useProjectStore.getState().settingsByProject[projectId]) return;
		void useProjectStore.getState().loadSettings(projectId);
	}, [projectId]);
	return settings;
}

/**
 * Stable, memoized sorted projects list. Use inside components instead of
 * `useProjectStore((s) => [...s.projects].sort(...))`，否则每次渲染都拿到新
 * 数组、触发 re-render。
 *
 * F-11: 默认过滤掉 archived 项目。要看归档项目走 `useArchivedProjects`。
 *
 * 排序规则：pinned 优先 → lastSeenAt desc → name asc。
 */
export function useSortedProjects(): Project[] {
	const projects = useProjectStore((s) => s.projects);
	return useMemo(
		() =>
			[...projects]
				.filter((p) => !p.archived)
				.sort((a, b) => {
					const ap = a.pinned ? 1 : 0;
					const bp = b.pinned ? 1 : 0;
					if (ap !== bp) return bp - ap;
					const at = a.lastSeenAt ?? 0;
					const bt = b.lastSeenAt ?? 0;
					if (at !== bt) return bt - at;
					return (a.name || "").localeCompare(b.name || "");
				}),
		[projects],
	);
}
