import { CheckCircleOutlined, KeyOutlined, SaveOutlined } from "@ant-design/icons";
import { Button, Input, message, theme } from "antd";
import type React from "react";
import { useEffect, useState } from "react";
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
		const loadApiKey = async () => {
			try {
				const result = await window.electron.ipc.invoke(
					"app:get-config",
					"skillsmpApiKey",
				);
				if (result) {
					setSkillsmpKey(result as string);
				}
			} catch (e) {
				console.error("Failed to load API key:", e);
			}
		};
		loadApiKey();
	}, []);

	const handleSave = async () => {
		setLoading(true);
		try {
			await window.electron.ipc.invoke(
				"app:set-config",
				"skillsmpApiKey",
				skillsmpKey,
			);
			setSaved(true);
			message.success(
				t("apiKeySaved", "API Key saved successfully", { ns: "settings" }),
			);
			setTimeout(() => setSaved(false), 2000);
		} catch (e) {
			message.error(
				t("apiKeySaveError", "Failed to save API Key", { ns: "settings" }),
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
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
							className="!rounded-xl"
							size="large"
							prefix={<KeyOutlined className="text-slate-400" />}
						/>
						<p className="text-xs mt-2" style={{ color: token.colorTextSecondary }}>
							{t(
								"settings.skillsmpApiKeyHint",
								"Get your API Key from skillsmp.com",
							)}
						</p>
					</div>

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
			</SettingSection>
		</div>
	);
};
