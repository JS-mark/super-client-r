import {
	CheckCircleOutlined,
	KeyOutlined,
	SaveOutlined,
} from "@ant-design/icons";
import { Button, Input, message, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingSection } from "./SettingSection";

const { useToken } = theme;

export const ApiKeysConfig: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [skillsmpKey, setSkillsmpKey] = useState("");
	const [loading, setLoading] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		const loadConfigs = async () => {
			try {
				const skillsmp = await window.electron.ipc.invoke("app:get-config", "skillsmpApiKey");
				if (skillsmp) setSkillsmpKey(skillsmp as string);
			} catch (e) {
				console.error("Failed to load configs:", e);
			}
		};
		loadConfigs();
	}, []);

	const handleSave = useCallback(async () => {
		setLoading(true);
		try {
			await window.electron.ipc.invoke(
				"app:set-config",
				"skillsmpApiKey",
				skillsmpKey,
			);
			setSaved(true);
			message.success(
				t("apiKeySaved", "Settings saved successfully", { ns: "settings" }),
			);
			setTimeout(() => setSaved(false), 2000);
		} catch {
			message.error(
				t("apiKeySaveError", "Failed to save settings", { ns: "settings" }),
			);
		} finally {
			setLoading(false);
		}
	}, [skillsmpKey, t]);

	return (
		<div className="space-y-6">
			{/* SkillsMP API */}
			<SettingSection
				title={t("skillsmpApi", "SkillsMP API", { ns: "settings" })}
				icon={<KeyOutlined />}
			>
				<div className="space-y-4">
					<div>
						<span
							className="block text-sm font-medium mb-2"
							style={{ color: token.colorText }}
						>
							{t("skillsmpApiKey", "API Key", { ns: "settings" })}
						</span>
						<Input.Password
							value={skillsmpKey}
							onChange={(e) => setSkillsmpKey(e.target.value)}
							placeholder={t(
								"settings.skillsmpApiKeyPlaceholder",
								"Enter your SkillsMP API Key",
							)}
							className="rounded-xl!"
							size="large"
							prefix={<KeyOutlined className="text-slate-400" />}
						/>
						<p
							className="text-xs mt-2"
							style={{ color: token.colorTextSecondary }}
						>
							{t(
								"settings.skillsmpApiKeyHint",
								"Get your API Key from skillsmp.com",
							)}
						</p>
					</div>
				</div>
			</SettingSection>

			{/* Save Button */}
			<Button
				type="primary"
				icon={saved ? <CheckCircleOutlined /> : <SaveOutlined />}
				onClick={handleSave}
				loading={loading}
				size="large"
				className="!rounded-xl"
			>
				{saved
					? t("saved", "Saved", { ns: "common" })
					: t("save", "Save", { ns: "common" })}
			</Button>
		</div>
	);
};
