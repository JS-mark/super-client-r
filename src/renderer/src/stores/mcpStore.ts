import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpServer } from "../types/mcp";

interface McpState {
	servers: McpServer[];
	addServer: (server: McpServer) => void;
	removeServer: (id: string) => void;
	updateServer: (id: string, updates: Partial<McpServer>) => void;
}

export const useMcpStore = create<McpState>()(
	persist(
		(set) => ({
			servers: [],
			addServer: (server) =>
				set((state) => ({ servers: [...state.servers, server] })),
			removeServer: (id) =>
				set((state) => ({ servers: state.servers.filter((s) => s.id !== id) })),
			updateServer: (id, updates) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, ...updates } : s,
					),
				})),
		}),
		{
			name: "mcp-storage",
		},
	),
);
