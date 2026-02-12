/**
 * Log Viewer Page - Standalone full-page log viewer
 * Loaded in a separate BrowserWindow via /#/log-viewer route
 */

import { Spin } from "antd";
import type React from "react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

const LogViewerPage: React.FC = () => {
	const { t } = useTranslation("logviewer");

	return (
		<Suspense
			fallback={
				<div className="h-screen flex items-center justify-center">
					<Spin size="large" />
				</div>
			}
		>
			<div className="h-screen flex flex-col">
				{/* Custom title bar area for frameless window */}
				<div
					className="h-8 flex items-center px-4 select-none shrink-0"
					style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
				>
					<span className="text-xs font-medium opacity-60">
						{t("title", "日志查看器")}
					</span>
				</div>

				<div className="flex-1 flex items-center justify-center">
					<Spin size="large" tip={t("loading", "加载中...")} />
				</div>
			</div>
		</Suspense>
	);
};

export default LogViewerPage;
