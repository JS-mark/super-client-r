/**
 * Inspector Panel Store
 *
 * 控制右侧「环境检视」面板（CodexEnvironmentInspector）的显示开关。
 *
 * - 持久化到 localStorage（用户手动切换的偏好跨重启保留）
 * - 默认 isOpen = true ——"对话时默认展示"语义
 * - 实际是否渲染由 Chat.tsx 把这里的开关与 profile/feature flag 一起做 AND
 *   （例如 fileArtifacts feature flag 关掉 → 不管开关如何都不显示）
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface InspectorPanelState {
	/** 用户偏好：是否要展示环境检视面板。 */
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

export const useInspectorPanelStore = create<InspectorPanelState>()(
	persist(
		(set, get) => ({
			isOpen: true,
			open: () => set({ isOpen: true }),
			close: () => set({ isOpen: false }),
			toggle: () => set({ isOpen: !get().isOpen }),
		}),
		{
			name: "inspector-panel-storage",
			partialize: (state) => ({ isOpen: state.isOpen }),
		},
	),
);
