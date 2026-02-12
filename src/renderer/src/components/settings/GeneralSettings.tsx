import {
	FolderOpenOutlined,
	GlobalOutlined,
	SettingOutlined,
	StarOutlined,
} from "@ant-design/icons";
import { Button, Card, Input, Select, Space, message } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { appService } from "../../services/appService";
import { FloatWidgetSettings } from "./FloatWidgetSettings";
import { SettingSection } from "./SettingSection";
import { ThemeSettings } from "./ThemeSettings";

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
	const { t, i18n } = useTranslation();
	const [userDataPath, setUserDataPath] = useState("");
	const [loading, setLoading] = useState(true);

	const loadData = useCallback(async () => {
		try {
			setLoading(true);
			const path = await withRetry(() => appService.getUserDataPath());
			setUserDataPath(path);
		} catch (e) {
			console.error("Failed to load general settings:", e);
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
		} catch (e) {
			message.error(
				t("openPathError", "Failed to open path", { ns: "settings" }),
			);
		}
	};

	const handleCheckUpdate = async () => {
		try {
			const result = await appService.checkUpdate();
			if (result.updateAvailable) {
				message.success(result.message);
			} else {
				message.info(result.message);
			}
		} catch (e) {
			message.error(
				t("checkUpdateError", "Failed to check updates", { ns: "settings" }),
			);
		}
	};

	return (
		<Card
			className="!border-0 !shadow-none !bg-transparent"
			loading={loading}
		>
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
								className="!rounded-l-xl"
								placeholder={t(
									"settings.userDataPathPlaceholder",
									"User data directory path",
								)}
							/>
							<Button
								icon={<FolderOpenOutlined />}
								onClick={handleOpenPath}
								className="!rounded-r-xl"
							>
								{t("open", "Open", { ns: "settings" })}
							</Button>
						</Space.Compact>
						<p className="text-xs text-slate-500 dark:text-slate-400">
							{t(
								"settings.userDataPathHint",
								"This directory stores application data and cannot be changed",
							)}
						</p>
					</div>
				</SettingSection>

				<SettingSection
					title={t("preferences", "Preferences", { ns: "settings" })}
					icon={<SettingOutlined />}
				>
					<ThemeSettings />
					<div className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700">
						<div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
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

				<SettingSection
					title={t("updates", "Updates", { ns: "settings" })}
					icon={<StarOutlined />}
				>
					<div className="flex items-center justify-between">
						<p className="text-sm text-slate-600 dark:text-slate-400">
							{t("checkForUpdates", "Check for application updates", { ns: "settings" })}
						</p>
						<Button onClick={handleCheckUpdate} className="!rounded-lg">
							{t("checkUpdate", "Check Update", { ns: "settings" })}
						</Button>
					</div>
				</SettingSection>
			</div>
		</Card>
	);
};
