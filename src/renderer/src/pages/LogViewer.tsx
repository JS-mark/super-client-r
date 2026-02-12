/**
 * Log Viewer Page - Standalone full-page log viewer
 * Loaded in a separate BrowserWindow via /#/log-viewer route
 */

import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LogDetailDrawer } from "../components/logviewer/LogDetailDrawer";
import { LogStatsPanel } from "../components/logviewer/LogStatsPanel";
import { LogViewerTable } from "../components/logviewer/LogViewerTable";
import { LogViewerToolbar } from "../components/logviewer/LogViewerToolbar";
import { useLogViewerStore } from "../stores/logViewerStore";

const LogViewerPage: React.FC = () => {
	const { t } = useTranslation("logviewer");
	const refresh = useLogViewerStore((s) => s.refresh);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return (
		<div className="h-screen flex flex-col overflow-hidden">
			{/* Custom title bar area for frameless window */}
			<div
				className="h-8 flex items-center px-4 select-none shrink-0 border-b border-solid border-gray-200 dark:border-gray-700"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				<span className="text-xs font-medium opacity-60">
					{t("title")}
				</span>
			</div>

			{/* Content */}
			<div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden">
				{/* Stats panel */}
				<LogStatsPanel />

				{/* Toolbar */}
				<LogViewerToolbar />

				{/* Table - takes remaining space */}
				<div className="flex-1 overflow-hidden">
					<LogViewerTable />
				</div>
			</div>

			{/* Detail drawer */}
			<LogDetailDrawer />
		</div>
	);
};

export default LogViewerPage;
