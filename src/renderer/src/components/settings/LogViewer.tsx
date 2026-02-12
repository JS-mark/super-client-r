import {
	ClearOutlined,
	FileSearchOutlined,
	FolderOpenOutlined,
} from "@ant-design/icons";
import { Button, message, Popconfirm, Space } from "antd";
import type React from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { appService } from "../../services/appService";
import { logService } from "../../services/logService";

export const LogViewer: React.FC = () => {
	const { t } = useTranslation();

	const handleOpenViewer = useCallback(() => {
		logService.openViewer();
	}, []);

	const handleOpenLogsFolder = useCallback(async () => {
		try {
			const logsPath = await appService.getLogsPath();
			await appService.openPath(logsPath);
		} catch {
			message.error(
				t("openLogsFolderError", "Failed to open logs folder", {
					ns: "settings",
				}),
			);
		}
	}, [t]);

	const handleClearLogs = useCallback(async () => {
		try {
			await appService.clearLogs();
			await logService.clearDb();
			message.success(
				t("clearLogsSuccess", "Logs cleared", { ns: "settings" }),
			);
		} catch {
			message.error(
				t("clearLogsError", "Failed to clear logs", { ns: "settings" }),
			);
		}
	}, [t]);

	return (
		<div className="space-y-4">
			<Space wrap>
				<Button
					type="primary"
					icon={<FileSearchOutlined />}
					onClick={handleOpenViewer}
					size="large"
					className="!rounded-xl"
				>
					{t("openLogViewer", "打开日志查看器", { ns: "settings" })}
				</Button>

				<Button
					icon={<FolderOpenOutlined />}
					onClick={handleOpenLogsFolder}
					size="large"
					className="!rounded-xl"
				>
					{t("openFolder", "Open Folder", { ns: "settings" })}
				</Button>

				<Popconfirm
					title={t("confirmClearLogs", "Clear all log files?", {
						ns: "settings",
					})}
					onConfirm={handleClearLogs}
					okText={t("confirm", "Confirm", { ns: "common" })}
					cancelText={t("cancel", "Cancel", { ns: "common" })}
				>
					<Button
						icon={<ClearOutlined />}
						danger
						size="large"
						className="!rounded-xl"
					>
						{t("clearLogs", "Clear Logs", { ns: "settings" })}
					</Button>
				</Popconfirm>
			</Space>
		</div>
	);
};
