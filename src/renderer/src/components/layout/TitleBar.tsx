import {
	CloseOutlined,
	FullscreenExitOutlined,
	FullscreenOutlined,
	MinusOutlined,
} from "@ant-design/icons";
import { Tooltip, theme } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMatches } from "react-router-dom";
import { type TitleContent, useTitleContext } from "../../hooks/useTitle";

const { useToken } = theme;

export const TitleBar: React.FC = () => {
	const { t } = useTranslation();
	const [isMaximized, setIsMaximized] = React.useState(false);
	const [isMac, setIsMac] = React.useState(false);
	const matches = useMatches();
	const { title: dynamicTitle } = useTitleContext();
	const { token } = useToken();

	// 从路由获取标题
	const routeTitle: TitleContent = React.useMemo(() => {
		const lastMatch = matches[matches.length - 1];
		if (lastMatch?.handle && typeof lastMatch.handle === "object") {
			return (lastMatch.handle as { title?: TitleContent }).title;
		}
		return undefined;
	}, [matches]);

	// 优先使用动态标题，其次是路由标题
	const displayTitle =
		dynamicTitle || routeTitle || t("name", "Super Client", { ns: "app" });

	// 判断是否为 React 元素
	const isReactElement = React.useMemo(() => {
		return React.isValidElement(displayTitle);
	}, [displayTitle]);

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
			className="h-auto py-3 flex items-center justify-between select-none"
			// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
			style={{ WebkitAppRegion: "drag", background: token.colorBgContainer }}
		>
			{/* 左侧：应用标题和图标 */}
			<div
				className={`flex items-center gap-2 px-4 flex-row w-full justify-between`}
			>
				{isReactElement ? (
					displayTitle
				) : (
					<span
						className="text-sm font-medium"
						style={{ color: token.colorText }}
					>
						{displayTitle as string}
					</span>
				)}
			</div>

			{/* 右侧：窗口控制按钮 - macOS 隐藏，使用系统自带交通灯 */}
			{!isMac && (
				<div
					className="flex items-center h-full"
					// @ts-expect-error - WebkitAppRegion is a valid CSS property for Electron
					style={{ WebkitAppRegion: "no-drag" }}
				>
					<Tooltip
						title={t("minimize", "最小化", { ns: "menu" })}
						placement="bottom"
					>
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
								? t("restore", "还原")
								: t("maximize", "最大化", { ns: "menu" })
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

					<Tooltip
						title={t("close", "关闭", { ns: "window" })}
						placement="bottom"
					>
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
