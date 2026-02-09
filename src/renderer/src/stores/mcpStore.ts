import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { McpServer } from "../types/mcp";

export interface McpMarketItem {
	id: string;
	name: string;
	description: string;
	version: string;
	author: string;
	icon?: string;
	tags: string[];
	rating: number;
	downloads: number;
	installUrl: string;
	readmeUrl: string;
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

interface McpState {
	// Installed servers
	servers: McpServer[];

	// Market
	marketItems: McpMarketItem[];
	isLoadingMarket: boolean;
	marketError: string | null;

	// Actions
	addServer: (server: McpServer) => void;
	removeServer: (id: string) => void;
	updateServer: (id: string, updates: Partial<McpServer>) => void;
	enableServer: (id: string) => void;
	disableServer: (id: string) => void;
	updateServerStatus: (id: string, status: McpServer["status"], error?: string) => void;
	updateServerTools: (id: string, tools: McpServer["tools"]) => void;

	// Market actions
	setMarketItems: (items: McpMarketItem[]) => void;
	setMarketLoading: (loading: boolean) => void;
	setMarketError: (error: string | null) => void;
	addMarketItem: (item: McpMarketItem) => void;
}

export const useMcpStore = create<McpState>()(
	persist(
		(set) => ({
			servers: [],
			marketItems: [],
			isLoadingMarket: false,
			marketError: null,

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

			enableServer: (id) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, enabled: true } : s,
					),
				})),

			disableServer: (id) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, enabled: false } : s,
					),
				})),

			updateServerStatus: (id, status, error) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, status, error } : s,
					),
				})),

			updateServerTools: (id, tools) =>
				set((state) => ({
					servers: state.servers.map((s) =>
						s.id === id ? { ...s, tools } : s,
					),
				})),

			// Market
			setMarketItems: (items) => set({ marketItems: items }),
			setMarketLoading: (loading) => set({ isLoadingMarket: loading }),
			setMarketError: (error) => set({ marketError: error }),
			addMarketItem: (item) =>
				set((state) => ({
					marketItems: [...state.marketItems, item],
				})),
		}),
		{
			name: "mcp-storage",
			partialize: (state) => ({
				servers: state.servers,
				// Don't persist market items, they should be fetched
			}),
		},
	),
);
