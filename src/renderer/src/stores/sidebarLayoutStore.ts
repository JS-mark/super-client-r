import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * R-8: dropped the `collapsed` field. The collapse toggle was removed from
 * both sidebars in §24.3; the persisted flag was force-reset on mount in the
 * meantime. Now removed from the schema entirely. zustand persist will silently
 * ignore the leftover `collapsed` key in localStorage from older clients.
 */
interface SidebarLayoutState {
	width: number;
	setWidth: (w: number) => void;
	resetWidth: () => void;
}

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 480;

export const SIDEBAR_DEFAULT_WIDTH = DEFAULT_WIDTH;
export const SIDEBAR_MIN_WIDTH = MIN_WIDTH;
export const SIDEBAR_MAX_WIDTH = MAX_WIDTH;

export const useSidebarLayoutStore = create<SidebarLayoutState>()(
	persist(
		(set) => ({
			width: DEFAULT_WIDTH,
			setWidth: (w) =>
				set({ width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)) }),
			resetWidth: () => set({ width: DEFAULT_WIDTH }),
		}),
		{
			name: "sidebar-layout",
			partialize: (state) => ({ width: state.width }),
		},
	),
);
