import {
	CheckCircleOutlined,
	GithubOutlined,
	GoogleOutlined,
	KeyOutlined,
	LinkOutlined,
	SaveOutlined,
} from "@ant-design/icons";
import { Button, Divider, Input, message, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingSection } from "./SettingSection";

const { useToken } = theme;

export const ApiKeysConfig: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [skillsmpKey, setSkillsmpKey] = useState("");
	const [googleClientId, setGoogleClientId] = useState("");
	const [githubClientId, setGithubClientId] = useState("");
	const [githubClientSec, setGithubClientSec] = useState("");
	const [loading, setLoading] = useState(false);
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		const loadConfigs = async () => {
			try {
				const [skillsmp, gClientId, ghClientId, ghClientSec] =
					await Promise.all([
						window.electron.ipc.invoke("app:get-config", "skillsmpApiKey"),
						window.electron.ipc.invoke("app:get-config", "googleClientId"),
						window.electron.ipc.invoke("app:get-config", "githubClientId"),
						window.electron.ipc.invoke(
							"app:get-config",
							"githubClientSecret",
						),
					]);
				if (skillsmp) setSkillsmpKey(skillsmp as string);
				if (gClientId) setGoogleClientId(gClientId as string);
				if (ghClientId) setGithubClientId(ghClientId as string);
				if (ghClientSec) setGithubClientSec(ghClientSec as string);
			} catch (e) {
				console.error("Failed to load configs:", e);
			}
		};
		loadConfigs();
	}, []);

	const handleSave = useCallback(async () => {
		setLoading(true);
		try {
			await Promise.all([
				window.electron.ipc.invoke(
					"app:set-config",
					"skillsmpApiKey",
					skillsmpKey,
				),
				window.electron.ipc.invoke(
					"app:set-config",
					"googleClientId",
					googleClientId,
				),
				window.electron.ipc.invoke(
					"app:set-config",
					"githubClientId",
					githubClientId,
				),
				window.electron.ipc.invoke(
					"app:set-config",
					"githubClientSecret",
					githubClientSec,
				),
			]);
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
	}, [skillsmpKey, googleClientId, githubClientId, githubClientSec, t]);

	return (
		<div className="space-y-6">
			{/* OAuth Configuration */}
			<SettingSection
				title={t("oauthConfig", "OAuth Login", { ns: "settings" })}
				icon={<LinkOutlined />}
			>
				<div className="space-y-4">
					{/* Google OAuth */}
					<div>
						<span
							className="block text-sm font-medium mb-2"
							style={{ color: token.colorText }}
						>
							<GoogleOutlined className="mr-2" />
							{t("googleClientId", "Google Client ID", { ns: "settings" })}
						</span>
						<Input
							value={googleClientId}
							onChange={(e) => setGoogleClientId(e.target.value)}
							placeholder={t(
								"settings.googleClientIdPlaceholder",
								"Enter your Google OAuth Client ID",
							)}
							className="rounded-xl!"
							size="large"
						/>
						<p
							className="text-xs mt-2"
							style={{ color: token.colorTextSecondary }}
						>
							{t(
								"settings.googleClientIdHint",
								"Create at Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Desktop app type). Uses PKCE — no client secret needed.",
							)}
						</p>
					</div>

					<Divider className="!my-4" />

					{/* GitHub OAuth */}
					<div>
						<span
							className="block text-sm font-medium mb-2"
							style={{ color: token.colorText }}
						>
							<GithubOutlined className="mr-2" />
							{t("githubClientId", "GitHub Client ID", { ns: "settings" })}
						</span>
						<Input
							value={githubClientId}
							onChange={(e) => setGithubClientId(e.target.value)}
							placeholder={t(
								"settings.githubClientIdPlaceholder",
								"Enter your GitHub OAuth Client ID",
							)}
							className="rounded-xl!"
							size="large"
						/>
					</div>
					<div>
						<span
							className="block text-sm font-medium mb-2"
							style={{ color: token.colorText }}
						>
							<GithubOutlined className="mr-2" />
							{t("githubClientSecret", "GitHub Client Secret", {
								ns: "settings",
							})}
						</span>
						<Input.Password
							value={githubClientSec}
							onChange={(e) => setGithubClientSec(e.target.value)}
							placeholder={t(
								"settings.githubClientSecretPlaceholder",
								"Enter your GitHub OAuth Client Secret",
							)}
							className="rounded-xl!"
							size="large"
						/>
						<p
							className="text-xs mt-2"
							style={{ color: token.colorTextSecondary }}
						>
							{t(
								"settings.githubOAuthHint",
								"Create at GitHub → Settings → Developer settings → OAuth Apps. Set callback URL to https://app.nexo-ai.top/auth/callback",
							)}
						</p>
					</div>
				</div>
			</SettingSection>

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
