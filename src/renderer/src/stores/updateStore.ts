import { create } from "zustand";
import { appService } from "../services/appService";
import { createLogger } from "../services/logService";

const log = createLogger("updateStore");

/**
 * 自动更新状态机（SUP-17）
 *
 * 四态文案对应：
 * - checking      → 检查中
 * - available     → 有新版本
 * - not-available → 已是最新
 * - error         → 更新失败（可重试）
 *
 * 额外的下载生命周期态（downloading / downloaded）用于展示进度与
 * "重启安装"入口，不属于四态文案但属于完整用户流程。
 */
export type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "not-available"
	| "downloading"
	| "downloaded"
	| "error";

export interface UpdateProgress {
	percent: number;
	bytesPerSecond: number;
	transferred: number;
	total: number;
}

interface UpdateState {
	status: UpdateStatus;
	/** 检测到的新版本号 */
	version: string | null;
	/** 下载进度（downloading 时有值） */
	progress: UpdateProgress | null;
	/** 最近一次错误信息（error 时有值） */
	error: string | null;
	/** 事件订阅是否已初始化，避免重复注册 */
	initialized: boolean;

	// Actions
	check: () => Promise<void>;
	download: () => Promise<void>;
	install: () => void;
	/** 订阅 main → renderer 的更新事件（自动检查亦经由此可见），返回取消订阅 */
	subscribe: () => () => void;
	reset: () => void;
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
	status: "idle",
	version: null,
	progress: null,
	error: null,
	initialized: false,

	check: async () => {
		set({ status: "checking", error: null, progress: null });
		try {
			const result = await appService.checkUpdate();
			if (result.error) {
				set({ status: "error", error: result.error });
			} else if (result.updateAvailable) {
				set({ status: "available", version: result.version ?? null });
			} else {
				set({ status: "not-available" });
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			log.error("Check for updates failed", e instanceof Error ? e : undefined);
			set({ status: "error", error: msg });
		}
	},

	download: async () => {
		set({ status: "downloading", error: null, progress: null });
		try {
			const res = await appService.downloadUpdate();
			if (res && res.success === false) {
				set({ status: "error", error: res.error ?? "Download failed" });
			}
			// 成功路径下由 download-progress / update-downloaded 事件驱动状态。
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			log.error("Download update failed", e instanceof Error ? e : undefined);
			set({ status: "error", error: msg });
		}
	},

	install: () => {
		// quitAndInstall 会退出应用，无需处理返回值。
		void appService.installUpdate();
	},

	subscribe: () => {
		if (get().initialized) {
			// 已订阅：返回 no-op，避免重复注册监听器。
			return () => {};
		}
		set({ initialized: true });

		const unsubs = [
			appService.onUpdateChecking(() => {
				set({ status: "checking", error: null, progress: null });
			}),
			appService.onUpdateAvailable((info) => {
				const version =
					info && typeof info === "object" && "version" in info
						? String((info as { version: unknown }).version)
						: null;
				set({ status: "available", version });
			}),
			appService.onUpdateNotAvailable(() => {
				set({ status: "not-available" });
			}),
			appService.onUpdateProgress((progress) => {
				set({ status: "downloading", progress });
			}),
			appService.onUpdateDownloaded((info) => {
				const version =
					info && typeof info === "object" && "version" in info
						? String((info as { version: unknown }).version)
						: get().version;
				set({ status: "downloaded", version, progress: null });
			}),
			appService.onUpdateError((error) => {
				set({ status: "error", error });
			}),
		];

		return () => {
			for (const unsub of unsubs) unsub();
			set({ initialized: false });
		};
	},

	reset: () => {
		set({ status: "idle", version: null, progress: null, error: null });
	},
}));
