import {
	FolderOpenOutlined,
	GlobalOutlined,
	SettingOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { App, Alert, Button, Card, Input, Progress, Select, Space, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { appService } from "../../services/appService";
import { useUpdateStore } from "../../stores/updateStore";
import { FloatWidgetSettings } from "./FloatWidgetSettings";
import { NetworkSettings } from "./NetworkSettings";
import { SettingSection } from "./SettingSection";
import { ThemeSettings } from "./ThemeSettings";
import { createLogger } from "../../services/logService";

const log = createLogger("GeneralSettings");

const { useToken } = theme;

// 错误重试工具函数
async function withRetry<T>(
	fn: () => Promise<T>,
	retries = 3,
	delay = 1000,
): Promise<T> {
	let lastError: Error | null = null;
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (e) {
			lastError = e as Error;
			if (i < retries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
			}
		}
	}
	throw lastError;
}

export const GeneralSettings: React.FC = () => {
	const { message } = App.useApp();
	const { t, i18n } = useTranslation();
	const { token } = useToken();
	const [userDataPath, setUserDataPath] = useState("");
	const [loading, setLoading] = useState(true);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const path = await withRetry(() => appService.getUserDataPath());
			setUserDataPath(path);
		} catch (e) {
			log.error("Failed to load general settings", e instanceof Error ? e : new Error(String(e)));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const handleOpenPath = async () => {
		try {
			await appService.openPath(userDataPath);
		} catch {
			message.error(
				t("openPathError", "Failed to open path", { ns: "settings" }),
			);
		}
	};

	const updateStatus = useUpdateStore((s) => s.status);
	const updateVersion = useUpdateStore((s) => s.version);
	const updateProgress = useUpdateStore((s) => s.progress);
	const updateError = useUpdateStore((s) => s.error);
	const checkUpdate = useUpdateStore((s) => s.check);
	const downloadUpdate = useUpdateStore((s) => s.download);
	const installUpdate = useUpdateStore((s) => s.install);
	const subscribeUpdate = useUpdateStore((s) => s.subscribe);

	// 订阅 main → renderer 更新事件（含自动检查结果），组件挂载期间生效。
	useEffect(() => subscribeUpdate(), [subscribeUpdate]);

	// 四态（+下载生命周期）文案
	const updateStatusText = (() => {
		switch (updateStatus) {
			case "checking":
				return t("update.checking", "Checking for updates...", {
					ns: "settings",
				});
			case "available":
				return t("update.availableHint", "A new version {{latest}} is ready", {
					ns: "settings",
					latest: updateVersion ?? "",
				});
			case "not-available":
				return t("update.notAvailable", "You are using the latest version", {
					ns: "settings",
				});
			case "downloading":
				return t("update.downloadingHint", "Downloading {{percent}}%", {
					ns: "settings",
					percent: Math.round(updateProgress?.percent ?? 0),
				});
			case "downloaded":
				return t("update.downloadedHint", "Version {{latest}} downloaded", {
					ns: "settings",
					latest: updateVersion ?? "",
				});
			case "error":
				return t("update.error", "Failed to check for updates: {{error}}", {
					ns: "settings",
					error: updateError ?? "",
				});
			default:
				return t("update.idle", "Check for the latest application updates", {
					ns: "settings",
				});
		}
	})();

	return (
		<Card className="border-0! shadow-none! bg-transparent!" loading={loading}>
			<div className="space-y-6">
				<SettingSection
					title={t("userDataPath", "User Data Directory", {
						ns: "settings",
					})}
				>
					<div className="space-y-2">
						<Space.Compact style={{ width: "100%" }}>
							<Input
								value={userDataPath}
								readOnly
								className="rounded-l-xl!"
								placeholder={t(
									"userDataPathPlaceholder",
									"User data directory path",
									{ ns: "settings" },
								)}
							/>
							<Button
								icon={<FolderOpenOutlined />}
								onClick={handleOpenPath}
								className="rounded-r-xl!"
							>
								{t("open", "Open", { ns: "settings" })}
							</Button>
						</Space.Compact>
						<p className="text-xs" style={{ color: token.colorTextSecondary }}>
							{t(
								"userDataPathHint",
								"This directory stores application data and cannot be changed",
								{ ns: "settings" },
							)}
						</p>
					</div>
				</SettingSection>

				<SettingSection
					title={t("preferences", "Preferences", { ns: "settings" })}
					icon={<SettingOutlined />}
				>
					<ThemeSettings />
					<div
						className="flex items-center justify-between py-2 border-t"
						style={{ borderColor: token.colorBorder }}
					>
						<div
							className="flex items-center gap-2"
							style={{ color: token.colorText }}
						>
							<GlobalOutlined className="text-sm" />
							<span className="text-sm">
								{t("language", "Language", { ns: "settings" })}
							</span>
						</div>
						<Select
							value={i18n.language}
							onChange={(value) => i18n.changeLanguage(value)}
							className="w-[100px]"
							size="small"
							variant="borderless"
							popupMatchSelectWidth={false}
							options={[
								{
									value: "zh",
									label: <span className="text-sm">中文</span>,
								},
								{
									value: "en",
									label: <span className="text-sm">English</span>,
								},
							]}
						/>
					</div>
				</SettingSection>

				<FloatWidgetSettings />

				<NetworkSettings />

				<SettingSection
					title={t("updates", "Updates", { ns: "settings" })}
					icon={<StarOutlined />}
				>
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<p
								className="text-sm"
								style={{ color: token.colorTextSecondary }}
							>
								{updateStatusText}
							</p>
							{/* 检查中 / 已是最新 / 空闲：显示「检查更新」按钮 */}
							{(updateStatus === "idle" ||
								updateStatus === "not-available" ||
								updateStatus === "checking") && (
								<Button
									onClick={() => checkUpdate()}
									loading={updateStatus === "checking"}
									className="rounded-lg!"
								>
									{t("checkUpdate", "Check Update", { ns: "settings" })}
								</Button>
							)}
							{/* 有新版本：显示「下载」按钮 */}
							{updateStatus === "available" && (
								<Button
									type="primary"
									onClick={() => downloadUpdate()}
									className="rounded-lg!"
								>
									{t("update.downloadBtn", "Download", { ns: "settings" })}
								</Button>
							)}
							{/* 已下载：显示「重启并安装」按钮 */}
							{updateStatus === "downloaded" && (
								<Button
									type="primary"
									onClick={() => installUpdate()}
									className="rounded-lg!"
								>
									{t("update.installBtn", "Restart & Install", {
										ns: "settings",
									})}
								</Button>
							)}
							{/* 失败：显示「重试」按钮 */}
							{updateStatus === "error" && (
								<Button
									danger
									onClick={() => checkUpdate()}
									className="rounded-lg!"
								>
									{t("update.retryBtn", "Retry", { ns: "settings" })}
								</Button>
							)}
						</div>

						{/* 下载进度条 */}
						{updateStatus === "downloading" && (
							<Progress
								percent={Math.round(updateProgress?.percent ?? 0)}
								size="small"
								status="active"
							/>
						)}

						{/* 更新失败详情 */}
						{updateStatus === "error" && updateError && (
							<Alert
								type="error"
								showIcon
								message={t("update.error", "Failed to check for updates: {{error}}", {
									ns: "settings",
									error: updateError,
								})}
							/>
						)}

						{/* 未签名安装包首启指引（SUP-8 / REG-02 对齐），
						    在有可安装更新时提示用户如何绕过 Gatekeeper/SmartScreen */}
						{(updateStatus === "available" ||
							updateStatus === "downloaded") && (
							<Alert
								type="info"
								showIcon
								message={t("update.unsigned.title", "Unsigned build notice", {
									ns: "settings",
								})}
								description={
									<div className="space-y-1 text-xs">
										<p>
											{t(
												"update.unsigned.desc",
												"This beta build is not code-signed yet.",
												{ ns: "settings" },
											)}
										</p>
										<p>
											{t("update.unsigned.mac", "macOS: right-click ...", {
												ns: "settings",
											})}
										</p>
										<p>
											{t("update.unsigned.win", "Windows: SmartScreen ...", {
												ns: "settings",
											})}
										</p>
									</div>
								}
							/>
						)}
					</div>
				</SettingSection>
			</div>
		</Card>
	);
};
