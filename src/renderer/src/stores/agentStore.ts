/**
 * Agent Store
 * 使用 Zustand 管理 Agent 状态
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AgentConfig, AgentSession } from "../types/electron";

interface AgentState {
	// 当前会话
	currentSession: AgentSession | null;
	// 会话历史
	sessions: AgentSession[];
	// 默认配置
	defaultConfig: AgentConfig | null;

	// Actions
	setCurrentSession: (session: AgentSession | null) => void;
	addSession: (session: AgentSession) => void;
	removeSession: (sessionId: string) => void;
	setDefaultConfig: (config: AgentConfig) => void;
	clearSessions: () => void;
}

export const useAgentStore = create<AgentState>()(
	persist(
		(set) => ({
			currentSession: null,
			sessions: [],
			defaultConfig: null,

			setCurrentSession: (session) => set({ currentSession: session }),

			addSession: (session) =>
				set((state) => ({
					sessions: [...state.sessions, session],
				})),

			removeSession: (sessionId) =>
				set((state) => ({
					sessions: state.sessions.filter((s) => s.id !== sessionId),
					currentSession:
						state.currentSession?.id === sessionId
							? null
							: state.currentSession,
				})),

			setDefaultConfig: (config) => set({ defaultConfig: config }),

			clearSessions: () => set({ sessions: [], currentSession: null }),
		}),
		{
			name: "agent-storage",
			partialize: (state) => ({
				defaultConfig: state.defaultConfig,
				sessions: state.sessions,
			}),
		},
	),
);
