import { ApiOutlined, RobotOutlined } from "@ant-design/icons";
import { Badge, Segmented } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ViewMode } from "../../hooks/useChatPageState";

interface ViewModeToggleProps {
	value: ViewMode;
	onChange: (mode: ViewMode) => void;
	unreadCount?: number;
}

export function ViewModeToggle({
	value,
	onChange,
	unreadCount = 0,
}: ViewModeToggleProps) {
	const { t } = useTranslation("chat");

	const options = useMemo(
		() => [
			{
				label: (
					<span className="flex items-center gap-1 px-1">
						<RobotOutlined />
						<span>{t("viewMode.local", "AI Chat")}</span>
					</span>
				),
				value: "local" as ViewMode,
			},
			{
				label: (
					<Badge count={unreadCount} size="small" offset={[6, -2]}>
						<span className="flex items-center gap-1 px-1">
							<ApiOutlined />
							<span>{t("viewMode.remote", "IM Messages")}</span>
						</span>
					</Badge>
				),
				value: "remote" as ViewMode,
			},
		],
		[t, unreadCount],
	);

	return (
		<Segmented
			size="small"
			options={options}
			value={value}
			onChange={(val) => onChange(val as ViewMode)}
		/>
	);
}
