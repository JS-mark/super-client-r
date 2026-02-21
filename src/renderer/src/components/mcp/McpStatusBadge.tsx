import { Badge } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";

export const McpStatusBadge: React.FC<{ status: string }> = ({ status }) => {
	const { t } = useTranslation();

	switch (status) {
		case "connected":
			return (
				<Badge status="success" text={t("status.connected", { ns: "mcp" })} />
			);
		case "connecting":
			return (
				<Badge
					status="processing"
					text={t("status.connecting", { ns: "mcp" })}
				/>
			);
		case "error":
			return <Badge status="error" text={t("status.error", { ns: "mcp" })} />;
		default:
			return (
				<Badge
					status="default"
					text={t("status.disconnected", { ns: "mcp" })}
				/>
			);
	}
};
