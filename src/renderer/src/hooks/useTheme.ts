/**
 * 主题 Hook
 * 支持 light、dark、auto 三种模式，与主进程同步
 */

import { useEffect } from "react";
import {
	initSystemThemeDetection,
	type ThemeMode,
	useThemeStore,
} from "../stores/themeStore";

export function useTheme() {
	const {
		mode,
		actualTheme,
		systemTheme,
		setMode,
		updateActualTheme,
		getEffectiveTheme,
		isDark,
	} = useThemeStore();

	// 初始化：从主进程加载主题设置
	useEffect(() => {
		const loadThemeFromMain = async () => {
			try {
				const response = await window.electron.theme.get();
				if (response.success && response.data) {
					setMode(response.data as ThemeMode);
				}
			} catch (error) {
				console.error("Failed to load theme from main:", error);
			}
		};
		loadThemeFromMain();
	}, [setMode]);

	// 初始化系统主题检测
	useEffect(() => {
		initSystemThemeDetection();
	}, []);

	// 当模式或系统主题变化时，更新实际主题
	useEffect(() => {
		updateActualTheme();
	}, [updateActualTheme]);

	// 监听主进程主题变更
	useEffect(() => {
		const unsubscribe = window.electron.theme.onChange((newMode) => {
			setMode(newMode as ThemeMode);
		});
		return unsubscribe;
	}, [setMode]);

	// 切换主题模式并同步到主进程
	const setThemeMode = async (newMode: ThemeMode) => {
		setMode(newMode);
		try {
			await window.electron.theme.set(newMode);
		} catch (error) {
			console.error("Failed to sync theme to main:", error);
		}
	};

	// 切换主题（light <-> dark，忽略 auto）
	const toggleTheme = async () => {
		const newMode =
			mode === "auto"
				? getEffectiveTheme() === "dark"
					? "light"
					: "dark"
				: mode === "dark"
					? "light"
					: "dark";
		await setThemeMode(newMode);
	};

	return {
		// 当前模式
		mode,
		// 实际应用的主题
		actualTheme,
		// 系统主题
		systemTheme,
		// 有效主题（auto 模式下为系统主题）
		effectiveTheme: getEffectiveTheme(),
		// 是否为暗色模式
		isDark: isDark(),
		// 设置模式
		setThemeMode,
		// 切换主题
		toggleTheme,
	};
}

export type { ThemeMode };
