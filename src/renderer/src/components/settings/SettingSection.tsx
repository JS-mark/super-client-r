import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, theme } from "antd";
import type React from "react";

const { useToken } = theme;

// 通用设置区块组件
export const SettingSection: React.FC<{
	title: string;
	icon?: React.ReactNode;
	children: React.ReactNode;
	extra?: React.ReactNode;
}> = ({ title, icon, children, extra }) => {
	const { token } = useToken();

	return (
		<div
			className="p-3 rounded-2xl border"
			style={{
				backgroundColor: token.colorBgContainer,
				borderColor: token.colorBorder,
			}}
		>
			<div className="flex items-center justify-between mb-4">
				<h3
					className="text-lg font-semibold flex items-center gap-2"
					style={{ color: token.colorTextHeading }}
				>
					{icon}
					{title}
				</h3>
				{extra}
			</div>
			{children}
		</div>
	);
};

// 错误状态组件
export const ErrorState: React.FC<{
	message: string;
	onRetry: () => void;
	loading?: boolean;
}> = ({ message: errorMessage, onRetry, loading }) => (
	<Alert
		type="error"
		title={errorMessage}
		className="mb-4"
		action={
			<Button
				size="small"
				onClick={onRetry}
				loading={loading}
				icon={<ReloadOutlined />}
			>
				重试
			</Button>
		}
	/>
);
