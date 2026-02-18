import {
	ApiOutlined,
	BulbOutlined,
	EyeOutlined,
	GlobalOutlined,
	NodeIndexOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Tooltip, theme } from "antd";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { ModelCapability } from "../../types/models";

const { useToken } = theme;

interface CapabilityStyle {
	icon: React.ReactNode;
	color: string;
	bg: string;
	darkColor: string;
	darkBg: string;
}

const CAPABILITY_CONFIG: Record<ModelCapability, CapabilityStyle> = {
	vision: {
		icon: <EyeOutlined />,
		color: "#16a34a",
		bg: "#f0fdf4",
		darkColor: "#4ade80",
		darkBg: "rgba(74, 222, 128, 0.15)",
	},
	web_search: {
		icon: <GlobalOutlined />,
		color: "#2563eb",
		bg: "#eff6ff",
		darkColor: "#60a5fa",
		darkBg: "rgba(96, 165, 250, 0.15)",
	},
	reasoning: {
		icon: <BulbOutlined />,
		color: "#ea580c",
		bg: "#fff7ed",
		darkColor: "#fb923c",
		darkBg: "rgba(251, 146, 60, 0.15)",
	},
	tool_use: {
		icon: <ToolOutlined />,
		color: "#b45309",
		bg: "#fffbeb",
		darkColor: "#fbbf24",
		darkBg: "rgba(251, 191, 36, 0.15)",
	},
	embedding: {
		icon: <ApiOutlined />,
		color: "#0891b2",
		bg: "#ecfeff",
		darkColor: "#22d3ee",
		darkBg: "rgba(34, 211, 238, 0.15)",
	},
	reranking: {
		icon: <NodeIndexOutlined />,
		color: "#9333ea",
		bg: "#faf5ff",
		darkColor: "#c084fc",
		darkBg: "rgba(192, 132, 252, 0.15)",
	},
};

interface CapabilityIconsProps {
	capabilities: ModelCapability[];
	size?: "small" | "default";
	className?: string;
}

export function CapabilityIcons({
	capabilities,
	size = "default",
	className,
}: CapabilityIconsProps) {
	const { t } = useTranslation();
	const { token } = useToken();

	// Ant Design dark algorithm produces a dark colorBgContainer
	const isDark = token.colorBgContainer.toLowerCase() < "#808080";

	const renderIcon = useCallback(
		(cap: ModelCapability) => {
			const config = CAPABILITY_CONFIG[cap];
			if (!config) return null;

			const color = isDark ? config.darkColor : config.color;
			const bg = isDark ? config.darkBg : config.bg;
			const label = t(`capabilities.${cap}`, { ns: "models" });

			return (
				<Tooltip key={cap} title={label}>
					<span
						className={cn(
							"inline-flex items-center justify-center rounded-full",
							size === "small" ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-xs",
						)}
						style={{ color, background: bg }}
					>
						{config.icon}
					</span>
				</Tooltip>
			);
		},
		[t, size, isDark],
	);

	if (capabilities.length === 0) return null;

	return (
		<div className={cn("flex items-center gap-1", className)}>
			{capabilities.map(renderIcon)}
		</div>
	);
}
