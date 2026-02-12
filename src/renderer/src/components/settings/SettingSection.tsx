import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button } from "antd";
import type React from "react";

// 通用设置区块组件
export const SettingSection: React.FC<{
	title: string;
	icon?: React.ReactNode;
	children: React.ReactNode;
	extra?: React.ReactNode;
}> = ({ title, icon, children, extra }) => (
	<div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
		<div className="flex items-center justify-between mb-4">
			<h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
				{icon}
				{title}
			</h3>
			{extra}
		</div>
		{children}
	</div>
);

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
