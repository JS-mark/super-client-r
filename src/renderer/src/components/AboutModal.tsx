import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { Button, Modal, message, theme } from "antd";
import type React from "react";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppInfo } from "../services/appService";
import { logService } from "../services/logService";

const { useToken } = theme;

interface AboutModalProps {
	open: boolean;
	onClose: () => void;
	appInfo: AppInfo | null;
}

export const AboutModal: React.FC<AboutModalProps> = ({
	open,
	onClose,
	appInfo,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();
	const clickCountRef = useRef(0);
	const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleTitleClick = useCallback(() => {
		clickCountRef.current += 1;

		if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
		clickTimerRef.current = setTimeout(() => {
			clickCountRef.current = 0;
		}, 3000);

		if (clickCountRef.current >= 8) {
			clickCountRef.current = 0;
			logService.openViewer();
		}
	}, []);

	const handleCopy = () => {
		if (!appInfo) return;

		const infoText = [
			`Version: ${appInfo.version}`,
			`Electron: ${appInfo.electron}`,
			`Node.js: ${appInfo.node}`,
			`Platform: ${appInfo.platform}`,
			`Architecture: ${appInfo.arch}`,
		].join("\n");

		navigator.clipboard.writeText(infoText).then(() => {
			message.success(t("copied", "已复制", { ns: "common" }));
		});
	};

	const infoItems = [
		{ label: "Version", value: appInfo?.version || "N/A" },
		{ label: "Electron", value: appInfo?.electron || "N/A" },
		{ label: "Node.js", value: appInfo?.node || "N/A" },
		{ label: "V8", value: appInfo?.v8 || "N/A" },
		{
			label: "OS",
			value: appInfo?.platform ? `${appInfo.platform} ${appInfo.arch}` : "N/A",
		},
	];

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			centered
			width={420}
			className="about-modal"
			closable={false}
			styles={{
				mask: {
					backgroundColor: "rgba(0, 0, 0, 0.6)"
				}
			}}
		>
			<div className="flex flex-col items-center py-4">
				{/* Logo */}
				<div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
					<img
						src="@/assets/icon.svg"
						alt="Logo"
						className="w-10 h-10"
						onError={(e) => {
							// 如果 SVG 加载失败，显示默认图标
							(e.target as HTMLImageElement).style.display = "none";
							const parent = (e.target as HTMLImageElement).parentElement;
							if (parent) {
								parent.innerHTML = '<span class="text-2xl">🚀</span>';
							}
						}}
					/>
				</div>

				{/* App Name - 8 clicks within 3s opens log viewer */}
				<h2
					className="text-xl font-semibold mb-6 cursor-default select-none active:opacity-80 transition-opacity"
					style={{ color: token.colorTextHeading }}
					onClick={handleTitleClick}
				>
					{appInfo?.name || "Super Client"}
				</h2>

				{/* Info List */}
				<div className="w-full space-y-3 mb-8">
					{infoItems.map((item) => (
						<div
							key={item.label}
							className="flex items-center justify-between text-sm"
						>
							<span style={{ color: token.colorTextSecondary }}>
								{item.label}
							</span>
							<span className="font-medium" style={{ color: token.colorText }}>
								{item.value}
							</span>
						</div>
					))}
				</div>

				{/* Buttons */}
				<div className="flex items-center gap-3">
					<Button
						type="primary"
						onClick={onClose}
						icon={<CheckOutlined />}
					>
						{t("confirm", "确定", { ns: "common" })}
					</Button>
					<Button
						onClick={handleCopy}
						icon={<CopyOutlined />}
					>
						{t("copy", "复制", { ns: "common" })}
					</Button>
				</div>
			</div>
		</Modal>
	);
};
