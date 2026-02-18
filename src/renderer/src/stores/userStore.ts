import { create } from "zustand";
import { persist } from "zustand/middleware";
import { authService } from "../services/authService";

export interface User {
	id: string;
	name: string;
	email?: string;
	avatar?: string;
	provider?: "google" | "github";
}

interface UserState {
	user: User | null;
	isLoggedIn: boolean;
	isLoading: boolean;
	error: string | null;
	login: (user: User) => void;
	loginWithOAuth: (provider: "google" | "github") => Promise<void>;
	logout: () => Promise<void>;
	restoreSession: () => Promise<void>;
}

export const useUserStore = create<UserState>()(
	persist(
		(set) => ({
			user: null,
			isLoggedIn: false,
			isLoading: false,
			error: null,
			login: (user) =>
				set({
					user,
					isLoggedIn: true,
					error: null,
				}),
			loginWithOAuth: async (provider) => {
				set({ isLoading: true, error: null });
				try {
					const response = await authService.login(provider);
					if (response.success && response.data) {
						set({
							user: response.data,
							isLoggedIn: true,
							isLoading: false,
							error: null,
						});
					} else {
						set({
							isLoading: false,
							error: response.error || "Login failed",
						});
					}
				} catch (error) {
					set({
						isLoading: false,
						error: (error as Error).message,
					});
				}
			},
			logout: async () => {
				try {
					await authService.logout();
				} catch {
					// Continue with local logout even if IPC fails
				}
				set({
					user: null,
					isLoggedIn: false,
					error: null,
				});
			},
			restoreSession: async () => {
				try {
					const response = await authService.getUser();
					if (response.success && response.data) {
						set({
							user: response.data,
							isLoggedIn: true,
						});
					}
				} catch {
					// Ignore restore errors
				}
			},
		}),
		{
			name: "user-storage",
			partialize: (state) => ({ user: state.user, isLoggedIn: state.isLoggedIn }),
		},
	),
);

/**
 * 获取用户名首字母
 */
export function getUserInitials(name: string): string {
	if (!name) return "?";
	return name.charAt(0).toUpperCase();
}

/**
 * 生成头像背景色（基于用户名）
 */
export function getAvatarColor(name: string): string {
	const colors = [
		"bg-red-500",
		"bg-orange-500",
		"bg-amber-500",
		"bg-yellow-500",
		"bg-lime-500",
		"bg-green-500",
		"bg-emerald-500",
		"bg-teal-500",
		"bg-cyan-500",
		"bg-sky-500",
		"bg-blue-500",
		"bg-indigo-500",
		"bg-violet-500",
		"bg-purple-500",
		"bg-fuchsia-500",
		"bg-pink-500",
		"bg-rose-500",
	];

	if (!name) return colors[0];

	// 使用用户名字符的 ASCII 码之和来决定颜色
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = name.charCodeAt(i) + ((hash << 5) - hash);
	}

	const index = Math.abs(hash) % colors.length;
	return colors[index];
}
