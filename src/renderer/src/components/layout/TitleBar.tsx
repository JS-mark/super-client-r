import {
	CloseOutlined,
	FullscreenExitOutlined,
	FullscreenOutlined,
	MinusOutlined,
} from "@ant-design/icons";
import { Tooltip } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

export const TitleBar: React.FC = () => {
	const { t } = useTranslation();
	const [isMaximized, setIsMaximized] = React.useState(false);
	const [isMac, setIsMac] = React.useState(false);

	React.useEffect(() => {
		// 检测平台
		setIsMac(navigator.platform.toLowerCase().includes("mac"));

		// 获取初始最大化状态
		window.electron.window.isMaximized().then((response) => {
			if (response.success && response.data !== undefined) {
				setIsMaximized(response.data);
			}
		});

		// 监听最大化状态变化
		const unsubscribe = window.electron.window.onMaximizeChange(
			(maximized: boolean) => {
				setIsMaximized(maximized);
			},
		);

		return unsubscribe;
	}, []);

	const handleMinimize = () => {
		window.electron.window.minimize();
	};

	const handleMaximize = () => {
		window.electron.window.maximize();
	};

	const handleClose = () => {
		window.electron.window.close();
	};

	return (
		<div
			className="h-10 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center justify-between select-none"
			// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
			style={{ WebkitAppRegion: "drag" }}
		>
			{/* 左侧：应用标题和图标 */}
			<div className={`flex items-center gap-2 ${isMac ? "px-20" : "px-4"}`}>
				<div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
					<span className="text-white font-bold text-xs">S</span>
				</div>
				<span className="text-slate-300 text-sm font-medium">
					{t("app.name", "Super Client")}
				</span>
			</div>

			{/* 右侧：窗口控制按钮 - macOS 隐藏，使用系统自带交通灯 */}
			{!isMac && (
				<div
					className="flex items-center h-full"
					// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
					style={{ WebkitAppRegion: "no-drag" }}
				>
					<Tooltip title={t("window.minimize", "最小化")} placement="bottom">
						<button
							type="button"
							onClick={handleMinimize}
							className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
						>
							<MinusOutlined className="text-sm" />
						</button>
					</Tooltip>

					<Tooltip
						title={
							isMaximized
								? t("window.restore", "还原")
								: t("window.maximize", "最大化")
						}
						placement="bottom"
					>
						<button
							type="button"
							onClick={handleMaximize}
							className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
						>
							{isMaximized ? (
								<FullscreenExitOutlined className="text-sm" />
							) : (
								<FullscreenOutlined className="text-sm" />
							)}
						</button>
					</Tooltip>

					<Tooltip title={t("window.close", "关闭")} placement="bottom">
						<button
							type="button"
							onClick={handleClose}
							className="w-12 h-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-red-500/80 transition-colors"
						>
							<CloseOutlined className="text-sm" />
						</button>
					</Tooltip>
				</div>
			)}
		</div>
	);
};
