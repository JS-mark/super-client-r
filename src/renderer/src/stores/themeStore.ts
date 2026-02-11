import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "auto";

interface ThemeState {
	// 当前主题模式
	mode: ThemeMode;
	// 实际应用的主题（auto 模式下根据系统决定）
	actualTheme: "light" | "dark";
	// 系统主题
	systemTheme: "light" | "dark";

	// Actions
	setMode: (mode: ThemeMode) => void;
	setSystemTheme: (theme: "light" | "dark") => void;
	updateActualTheme: () => void;
	// Getters
	getEffectiveTheme: () => "light" | "dark";
	isDark: () => boolean;
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set, get) => ({
			mode: "auto",
			actualTheme: "light",
			systemTheme: "light",

			setMode: (mode) => {
				set({ mode });
				// 更新实际主题
				get().updateActualTheme();
			},

			setSystemTheme: (systemTheme) => {
				set({ systemTheme });
				// 如果是 auto 模式，需要更新实际主题
				if (get().mode === "auto") {
					get().updateActualTheme();
				}
			},

			updateActualTheme: () => {
				const { mode, systemTheme } = get();
				const actualTheme = mode === "auto" ? systemTheme : mode;
				set({ actualTheme });

				// 应用到 DOM
				if (actualTheme === "dark") {
					document.documentElement.classList.add("dark");
					document.documentElement.classList.remove("light");
				} else {
					document.documentElement.classList.add("light");
					document.documentElement.classList.remove("dark");
				}
			},

			getEffectiveTheme: () => {
				const { mode, systemTheme } = get();
				return mode === "auto" ? systemTheme : mode;
			},

			isDark: () => {
				return get().getEffectiveTheme() === "dark";
			},
		}),
		{
			name: "theme-storage",
			partialize: (state) => ({ mode: state.mode }),
		},
	),
);

// 初始化系统主题检测
export function initSystemThemeDetection() {
	const { setSystemTheme, updateActualTheme } = useThemeStore.getState();

	// 检测系统主题
	const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	const systemTheme = mediaQuery.matches ? "dark" : "light";
	setSystemTheme(systemTheme);
	updateActualTheme();

	// 监听系统主题变化
	mediaQuery.addEventListener("change", (e) => {
		const newSystemTheme = e.matches ? "dark" : "light";
		setSystemTheme(newSystemTheme);
	});
}
