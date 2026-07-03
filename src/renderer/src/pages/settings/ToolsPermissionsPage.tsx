import { Button, Card, theme } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SettingSection } from "../../components/settings/SettingSection";

const { useToken } = theme;

const ToolsPermissionsPage: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { token } = useToken();

	return (
		<Card className="border-0! shadow-none! bg-transparent!">
			<SettingSection
				title={t("settingsNav.toolsPermissions", "Tools & Permissions", {
					ns: "settings",
				})}
			>
				<div className="flex items-center justify-between gap-4">
					<p
						className="text-sm m-0"
						style={{ color: token.colorTextSecondary }}
					>
						{t(
							"settingsNav.toolsPermissionsDesc",
							"Tool approval, sandbox and permission grant controls will stay in this Agent settings group as those controls land.",
							{ ns: "settings" },
						)}
					</p>
					<Button onClick={() => navigate("/settings/projects")}>
						{t("settingsNav.openProjects", "Open Projects", {
							ns: "settings",
						})}
					</Button>
				</div>
			</SettingSection>
		</Card>
	);
};

export default ToolsPermissionsPage;
