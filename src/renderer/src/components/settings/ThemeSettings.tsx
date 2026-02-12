import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Select } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import { type ThemeMode, useTheme } from "../../hooks/useTheme";

export const ThemeSettings: React.FC = () => {
	const { t } = useTranslation();
	const { mode, isDark, setThemeMode } = useTheme();

	const themeOptions = [
		{
			value: "light",
			label: t("theme.light", "Light", { ns: "settings" }),
			icon: <SunOutlined />,
		},
		{
			value: "dark",
			label: t("theme.dark", "Dark", { ns: "settings" }),
			icon: <MoonOutlined />,
		},
		{
			value: "auto",
			label: t("theme.auto", "Auto", { ns: "settings" }),
			icon: <DesktopOutlined />,
		},
	];

	return (
		<div className="flex items-center justify-between py-2">
			<div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
				{isDark ? (
					<MoonOutlined className="text-sm" />
				) : (
					<SunOutlined className="text-sm" />
				)}
				<span className="text-sm">
					{t("theme", "Theme", { ns: "settings" })}
				</span>
			</div>
			<Select
				value={mode}
				onChange={(value) => setThemeMode(value as ThemeMode)}
				className="w-[100px]"
				size="small"
				variant="borderless"
				popupMatchSelectWidth={false}
				options={themeOptions.map((option) => ({
					value: option.value,
					label: (
						<div className="flex items-center gap-1.5">
							<span className="text-sm">{option.icon}</span>
							<span className="text-sm">{option.label}</span>
						</div>
					),
				}))}
			/>
		</div>
	);
};
