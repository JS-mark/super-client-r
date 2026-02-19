import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Message } from "./chatStore";

// 工作区类型
export type WorkspaceType = "personal" | "work" | "project" | "temp";

// 工作区数据模型
export interface Workspace {
	id: string;
	name: string;
	description?: string;
	type: WorkspaceType;
	color?: string;
	icon?: string;
	createdAt: number;
	updatedAt: number;
	// 关联的会话ID列表
	sessionIds: string[];
	// 当前激活的会话ID
	activeSessionId?: string;
	// 设置
	settings: WorkspaceSettings;
	// 是否启用
	enabled: boolean;
	// 排序权重
	order: number;
}

// 工作区设置
export interface WorkspaceSettings {
	// 自动保存
	autoSave: boolean;
	// 默认模型
	defaultModel?: string;
	// 系统提示词
	systemPrompt?: string;
	// 温度设置
	temperature?: number;
	// 最大上下文长度
	maxContextLength?: number;
	// 自定义变量
	variables?: Record<string, string>;
}

// 工作区状态
interface WorkspaceState {
	// 所有工作区
	workspaces: Workspace[];
	// 当前工作区ID
	currentWorkspaceId: string | null;
	// 默认工作区ID
	defaultWorkspaceId: string | null;
	// 是否已初始化
	initialized: boolean;
}

// 工作区动作
interface WorkspaceActions {
	// 初始化默认工作区
	initDefaultWorkspace: () => void;
	// 创建工作区
	createWorkspace: (data: Partial<Omit<Workspace, "id" | "createdAt" | "updatedAt">>) => string;
	// 更新工作区
	updateWorkspace: (id: string, data: Partial<Workspace>) => void;
	// 删除工作区
	deleteWorkspace: (id: string) => boolean;
	// 切换工作区
	switchWorkspace: (id: string) => void;
	// 设置默认工作区
	setDefaultWorkspace: (id: string) => void;
	// 添加会话到工作区
	addSessionToWorkspace: (workspaceId: string, sessionId: string) => void;
	// 从工作区移除会话
	removeSessionFromWorkspace: (workspaceId: string, sessionId: string) => void;
	// 设置工作区激活会话
	setActiveSession: (workspaceId: string, sessionId: string) => void;
	// 获取当前工作区
	getCurrentWorkspace: () => Workspace | undefined;
	// 获取工作区 by ID
	getWorkspace: (id: string) => Workspace | undefined;
	// 导出工作区
	exportWorkspace: (id: string) => WorkspaceExportData;
	// 导入工作区
	importWorkspace: (data: WorkspaceExportData) => string;
	// 复制工作区
	duplicateWorkspace: (id: string, newName?: string) => string;
	// 重新排序工作区
	reorderWorkspaces: (orderedIds: string[]) => void;
	// 获取工作区统计
	getWorkspaceStats: (id: string) => WorkspaceStats;
}

// 工作区导出数据
export interface WorkspaceExportData {
	version: string;
	workspace: Omit<Workspace, "id" | "createdAt" | "updatedAt">;
	// 导出的会话数据
	sessions: {
		id: string;
		name: string;
		messages: Message[];
		createdAt: number;
	}[];
	exportedAt: string;
}

// 工作区统计
export interface WorkspaceStats {
	totalSessions: number;
	totalMessages: number;
	createdAt: number;
	lastActivityAt: number;
	diskUsage?: number;
}

// 预设颜色
export const WORKSPACE_COLORS = [
	"#3b82f6", // blue
	"#22c55e", // green
	"#f97316", // orange
	"#ef4444", // red
	"#a855f7", // purple
	"#ec4899", // pink
	"#14b8a6", // teal
	"#6366f1", // indigo
	"#84cc16", // lime
	"#f59e0b", // amber
];

// 获取随机颜色
function getRandomColor(): string {
	return WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)];
}

// 生成ID
function generateId(): string {
	return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// 默认工作区设置
const DEFAULT_SETTINGS: WorkspaceSettings = {
	autoSave: true,
	temperature: 0.7,
	maxContextLength: 4000,
	variables: {},
};

// 创建默认工作区
function createDefaultWorkspace(): Workspace {
	const now = Date.now();
	return {
		id: "default",
		name: "默认工作区",
		description: "默认工作区，用于日常对话",
		type: "personal",
		color: WORKSPACE_COLORS[0],
		icon: "🏠",
		createdAt: now,
		updatedAt: now,
		sessionIds: [],
		settings: { ...DEFAULT_SETTINGS },
		enabled: true,
		order: 0,
	};
}

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>()(
	persist(
		(set, get) => ({
			workspaces: [],
			currentWorkspaceId: null,
			defaultWorkspaceId: null,
			initialized: false,

			initDefaultWorkspace: () => {
				const { workspaces, initialized } = get();
				if (!initialized || workspaces.length === 0) {
					const defaultWorkspace = createDefaultWorkspace();
					set({
						workspaces: [defaultWorkspace],
						currentWorkspaceId: defaultWorkspace.id,
						defaultWorkspaceId: defaultWorkspace.id,
						initialized: true,
					});
				}
			},

			createWorkspace: (data) => {
				const now = Date.now();
				const newWorkspace: Workspace = {
					id: generateId(),
					name: data.name || "新工作区",
					description: data.description || "",
					type: data.type || "personal",
					color: data.color || getRandomColor(),
					icon: data.icon || "💼",
					createdAt: now,
					updatedAt: now,
					sessionIds: data.sessionIds || [],
					activeSessionId: data.activeSessionId,
					settings: { ...DEFAULT_SETTINGS, ...data.settings },
					enabled: data.enabled ?? true,
					order: get().workspaces.length,
				};

				set((state) => ({
					workspaces: [...state.workspaces, newWorkspace],
					currentWorkspaceId: newWorkspace.id,
				}));

				return newWorkspace.id;
			},

			updateWorkspace: (id, data) => {
				set((state) => ({
					workspaces: state.workspaces.map((ws) =>
						ws.id === id
							? { ...ws, ...data, updatedAt: Date.now() }
							: ws
					),
				}));
			},

			deleteWorkspace: (id) => {
				const { workspaces, defaultWorkspaceId, currentWorkspaceId } = get();
				const workspace = workspaces.find((w) => w.id === id);

				if (!workspace) return false;
				if (id === defaultWorkspaceId) return false; // 不能删除默认工作区

				const newWorkspaces = workspaces.filter((w) => w.id !== id);
				let newCurrentId = currentWorkspaceId;

				if (currentWorkspaceId === id) {
					newCurrentId = defaultWorkspaceId;
				}

				set({
					workspaces: newWorkspaces,
					currentWorkspaceId: newCurrentId,
				});

				return true;
			},

			switchWorkspace: (id) => {
				const workspace = get().workspaces.find((w) => w.id === id);
				if (workspace && workspace.enabled) {
					set({ currentWorkspaceId: id });
				}
			},

			setDefaultWorkspace: (id) => {
				set({ defaultWorkspaceId: id });
			},

			addSessionToWorkspace: (workspaceId, sessionId) => {
				set((state) => ({
					workspaces: state.workspaces.map((ws) =>
						ws.id === workspaceId && !ws.sessionIds.includes(sessionId)
							? {
									...ws,
									sessionIds: [...ws.sessionIds, sessionId],
									updatedAt: Date.now(),
								}
							: ws
					),
				}));
			},

			removeSessionFromWorkspace: (workspaceId, sessionId) => {
				set((state) => ({
					workspaces: state.workspaces.map((ws) =>
						ws.id === workspaceId
							? {
									...ws,
									sessionIds: ws.sessionIds.filter((id) => id !== sessionId),
									activeSessionId:
										ws.activeSessionId === sessionId
											? undefined
											: ws.activeSessionId,
									updatedAt: Date.now(),
								}
							: ws
					),
				}));
			},

			setActiveSession: (workspaceId, sessionId) => {
				set((state) => ({
					workspaces: state.workspaces.map((ws) =>
						ws.id === workspaceId
							? { ...ws, activeSessionId: sessionId, updatedAt: Date.now() }
							: ws
					),
				}));
			},

			getCurrentWorkspace: () => {
				const { workspaces, currentWorkspaceId } = get();
				return workspaces.find((w) => w.id === currentWorkspaceId);
			},

			getWorkspace: (id) => {
				return get().workspaces.find((w) => w.id === id);
			},

			exportWorkspace: (id) => {
				const workspace = get().getWorkspace(id);
				if (!workspace) {
					throw new Error(`Workspace ${id} not found`);
				}

				// 这里需要从chatStore获取会话数据
				// 由于不能跨store直接访问，这里只导出工作区结构
				const exportData: WorkspaceExportData = {
					version: "1.0.0",
					workspace: {
						name: workspace.name,
						description: workspace.description,
						type: workspace.type,
						color: workspace.color,
						icon: workspace.icon,
						sessionIds: workspace.sessionIds,
						settings: workspace.settings,
						enabled: workspace.enabled,
						order: workspace.order,
					},
					sessions: [], // 需要通过其他方式填充
					exportedAt: new Date().toISOString(),
				};

				return exportData;
			},

			importWorkspace: (data) => {
				const now = Date.now();
				const importedWorkspace: Workspace = {
					id: generateId(),
					name: `${data.workspace.name} (导入)`,
					description: data.workspace.description,
					type: data.workspace.type,
					color: data.workspace.color || getRandomColor(),
					icon: data.workspace.icon,
					createdAt: now,
					updatedAt: now,
					sessionIds: [], // 导入后需要重新关联会话
					settings: { ...DEFAULT_SETTINGS, ...data.workspace.settings },
					enabled: true,
					order: get().workspaces.length,
				};

				set((state) => ({
					workspaces: [...state.workspaces, importedWorkspace],
				}));

				return importedWorkspace.id;
			},

			duplicateWorkspace: (id, newName) => {
				const workspace = get().getWorkspace(id);
				if (!workspace) {
					throw new Error(`Workspace ${id} not found`);
				}

				return get().createWorkspace({
					name: newName || `${workspace.name} (复制)`,
					description: workspace.description,
					type: workspace.type,
					color: workspace.color,
					icon: workspace.icon,
					settings: { ...workspace.settings },
				});
			},

			reorderWorkspaces: (orderedIds) => {
				set((state) => ({
					workspaces: state.workspaces
						.map((ws) => ({
							...ws,
							order: orderedIds.indexOf(ws.id),
						}))
						.sort((a, b) => a.order - b.order),
				}));
			},

			getWorkspaceStats: (id) => {
				const workspace = get().getWorkspace(id);
				if (!workspace) {
					return {
						totalSessions: 0,
						totalMessages: 0,
						createdAt: 0,
						lastActivityAt: 0,
					};
				}

				return {
					totalSessions: workspace.sessionIds.length,
					totalMessages: 0, // 需要从chatStore计算
					createdAt: workspace.createdAt,
					lastActivityAt: workspace.updatedAt,
				};
			},
		}),
		{
			name: "workspace-storage",
			partialize: (state) => ({
				workspaces: state.workspaces,
				currentWorkspaceId: state.currentWorkspaceId,
				defaultWorkspaceId: state.defaultWorkspaceId,
				initialized: state.initialized,
			}),
		}
	)
);
