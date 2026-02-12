/**
 * Log Viewer Store - Zustand store for log viewer state (no persist)
 */

import { create } from "zustand";
import { logService } from "../services/logService";
import type {
	LogQueryParams,
	LogRecord,
	LogStats,
} from "../services/logService";

interface LogViewerFilters {
	level: string[];
	module: string[];
	process: string[];
	keyword: string;
	startTime: number | undefined;
	endTime: number | undefined;
}

interface LogViewerState {
	// Data
	records: LogRecord[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	sortOrder: "asc" | "desc";
	filters: LogViewerFilters;
	stats: LogStats | null;
	modules: string[];
	isLoading: boolean;
	selectedRecord: LogRecord | null;
	detailOpen: boolean;
	statsExpanded: boolean;

	// Actions
	fetchLogs: () => Promise<void>;
	fetchStats: () => Promise<void>;
	fetchModules: () => Promise<void>;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	setFilters: (filters: Partial<LogViewerFilters>) => void;
	setSortOrder: (order: "asc" | "desc") => void;
	setSelectedRecord: (record: LogRecord | null) => void;
	setDetailOpen: (open: boolean) => void;
	setStatsExpanded: (expanded: boolean) => void;
	clearLogs: () => Promise<{ success: boolean }>;
	exportLogs: () => Promise<{ success: boolean; count?: number }>;
	refresh: () => Promise<void>;
}

const defaultFilters: LogViewerFilters = {
	level: [],
	module: [],
	process: [],
	keyword: "",
	startTime: undefined,
	endTime: undefined,
};

export const useLogViewerStore = create<LogViewerState>()((set, get) => ({
	records: [],
	total: 0,
	page: 1,
	pageSize: 50,
	totalPages: 0,
	sortOrder: "desc",
	filters: { ...defaultFilters },
	stats: null,
	modules: [],
	isLoading: false,
	selectedRecord: null,
	detailOpen: false,
	statsExpanded: false,

	fetchLogs: async () => {
		const { page, pageSize, sortOrder, filters } = get();
		set({ isLoading: true });
		try {
			const params: LogQueryParams = {
				page,
				pageSize,
				sortOrder,
				level: filters.level.length > 0 ? filters.level : undefined,
				module: filters.module.length > 0 ? filters.module : undefined,
				process: filters.process.length > 0 ? filters.process : undefined,
				keyword: filters.keyword || undefined,
				startTime: filters.startTime,
				endTime: filters.endTime,
			};
			const result = await logService.query(params);
			set({
				records: result.records,
				total: result.total,
				page: result.page,
				pageSize: result.pageSize,
				totalPages: result.totalPages,
				isLoading: false,
			});
		} catch {
			set({ isLoading: false });
		}
	},

	fetchStats: async () => {
		try {
			const stats = await logService.getStats();
			set({ stats });
		} catch {
			// ignore
		}
	},

	fetchModules: async () => {
		try {
			const modules = await logService.getModules();
			set({ modules });
		} catch {
			// ignore
		}
	},

	setPage: (page: number) => {
		set({ page });
		get().fetchLogs();
	},

	setPageSize: (pageSize: number) => {
		set({ pageSize, page: 1 });
		get().fetchLogs();
	},

	setFilters: (newFilters: Partial<LogViewerFilters>) => {
		set((state) => ({
			filters: { ...state.filters, ...newFilters },
			page: 1,
		}));
		get().fetchLogs();
	},

	setSortOrder: (order: "asc" | "desc") => {
		set({ sortOrder: order, page: 1 });
		get().fetchLogs();
	},

	setSelectedRecord: (record: LogRecord | null) => {
		set({ selectedRecord: record, detailOpen: !!record });
	},

	setDetailOpen: (open: boolean) => {
		set({ detailOpen: open });
		if (!open) set({ selectedRecord: null });
	},

	setStatsExpanded: (expanded: boolean) => {
		set({ statsExpanded: expanded });
	},

	clearLogs: async () => {
		const result = await logService.clearDb();
		if (result.success) {
			set({
				records: [],
				total: 0,
				page: 1,
				totalPages: 0,
				stats: null,
			});
		}
		return result;
	},

	exportLogs: async () => {
		const { filters, sortOrder } = get();
		const params: LogQueryParams = {
			sortOrder,
			level: filters.level.length > 0 ? filters.level : undefined,
			module: filters.module.length > 0 ? filters.module : undefined,
			process: filters.process.length > 0 ? filters.process : undefined,
			keyword: filters.keyword || undefined,
			startTime: filters.startTime,
			endTime: filters.endTime,
		};
		return logService.exportLogs(params);
	},

	refresh: async () => {
		await Promise.all([
			get().fetchLogs(),
			get().fetchStats(),
			get().fetchModules(),
		]);
	},
}));
