import { CheckOutlined, CopyOutlined } from "@ant-design/icons";
import { Button, Modal, message } from "antd";
import type React from "react";
import { useTranslation } from "react-i18next";
import type { AppInfo } from "../services/appService";

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
						src="logo.svg"
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

				{/* App Name */}
				<h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-6">
					{appInfo?.name || "Super Client"}
				</h2>

				{/* Info List */}
				<div className="w-full space-y-3 mb-8">
					{infoItems.map((item) => (
						<div
							key={item.label}
							className="flex items-center justify-between text-sm"
						>
							<span className="text-slate-500 dark:text-slate-400">
								{item.label}
							</span>
							<span className="text-slate-700 dark:text-slate-200 font-medium">
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
