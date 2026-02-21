import { DesktopOutlined } from "@ant-design/icons";
import { Switch, theme } from "antd";
import type React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingSection } from "./SettingSection";

const { useToken } = theme;

export const FloatWidgetSettings: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [enabled, setEnabled] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const loadSetting = async () => {
			try {
				const result = await window.electron.ipc.invoke(
					"app:get-config",
					"floatWidgetEnabled",
				);
				setEnabled(result === true);
			} catch {
				setEnabled(false);
			} finally {
				setLoading(false);
			}
		};
		loadSetting();
	}, []);

	const handleToggle = async (checked: boolean) => {
		setEnabled(checked);
		await window.electron.ipc.invoke(
			"app:set-config",
			"floatWidgetEnabled",
			checked,
		);
		if (checked) {
			window.electron.ipc.send("float-widget:show");
		} else {
			window.electron.ipc.send("float-widget:hide");
		}
	};

	return (
		<SettingSection
			title={t("floatWidget", "Float Widget", { ns: "settings" })}
			icon={<DesktopOutlined />}
		>
			<div className="flex items-center justify-between">
				<div>
					<p className="font-medium" style={{ color: token.colorText }}>
						{t("enableFloatWidget", "Enable Float Widget", { ns: "settings" })}
					</p>
					<p
						className="text-xs mt-1"
						style={{ color: token.colorTextSecondary }}
					>
						{t("floatWidgetHint", "Show a floating widget on desktop", {
							ns: "settings",
						})}
					</p>
				</div>
				<Switch
					checked={enabled}
					onChange={handleToggle}
					size="default"
					disabled={loading}
				/>
			</div>
		</SettingSection>
	);
};
