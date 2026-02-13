import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { theme } from "antd";
import type * as React from "react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import type { Message } from "../../stores/chatStore";

const { useToken } = theme;

export const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
}> = ({ toolCall }) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const { token } = useToken();

	const getStatusStyles = () => {
		switch (toolCall.status) {
			case "pending":
				return {
					icon: <LoadingOutlined className="animate-spin" />,
					iconColor: token.colorInfo,
					bg: token.colorInfoBg,
					border: token.colorInfoBorder,
				};
			case "success":
				return {
					icon: <CheckCircleOutlined />,
					iconColor: token.colorSuccess,
					bg: token.colorSuccessBg,
					border: token.colorSuccessBorder,
				};
			case "error":
				return {
					icon: <CloseCircleOutlined />,
					iconColor: token.colorError,
					bg: token.colorErrorBg,
					border: token.colorErrorBorder,
				};
			default:
				return {
					icon: null,
					iconColor: token.colorText,
					bg: token.colorBgContainer,
					border: token.colorBorder,
				};
		}
	};

	const statusStyles = getStatusStyles();

	return (
		<div
			className={cn(
				"my-3 rounded-xl border overflow-hidden transition-all",
			)}
			style={{
				backgroundColor: statusStyles.bg,
				borderColor: statusStyles.border,
			}}
		>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center gap-3 transition-colors"
				style={{ backgroundColor: 'transparent' }}
				onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${token.colorText}0D`; }}
				onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
			>
				<span className="text-lg" style={{ color: statusStyles.iconColor }}>
					{statusStyles.icon}
				</span>
				<div className="flex-1 text-left">
					<div className="font-medium text-sm" style={{ color: token.colorText }}>
						{toolCall.name}
					</div>
					<div className="text-xs capitalize" style={{ color: token.colorTextSecondary }}>
						{toolCall.status}
					</div>
				</div>
				<span className="text-xs" style={{ color: token.colorTextTertiary }}>{isExpanded ? "▼" : "▶"}</span>
			</button>

			{isExpanded && (
				<div className="px-4 pb-4 space-y-3">
					<div
						className="rounded-lg p-3"
						style={{ backgroundColor: `${token.colorBgContainer}80` }}
					>
						<div className="text-xs font-medium mb-1" style={{ color: token.colorTextSecondary }}>Input</div>
						<pre
							className="text-xs overflow-auto max-h-24"
							style={{ color: token.colorText }}
						>
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					</div>

					{toolCall.result !== undefined && (
						<div
							className="rounded-lg p-3"
							style={{ backgroundColor: `${token.colorBgContainer}80` }}
						>
							<div className="text-xs font-medium mb-1" style={{ color: token.colorTextSecondary }}>
								Result
							</div>
							<pre
								className="text-xs overflow-auto max-h-32"
								style={{ color: token.colorText }}
							>
								{typeof toolCall.result === "string"
									? toolCall.result
									: JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.error && (
						<div
							className="rounded-lg p-3 text-sm"
							style={{
								backgroundColor: token.colorErrorBg,
								color: token.colorError,
							}}
						>
							{toolCall.error}
						</div>
					)}

					{toolCall.duration !== undefined && (
						<div className="text-right text-xs" style={{ color: token.colorTextTertiary }}>
							Duration: {toolCall.duration}ms
						</div>
					)}
				</div>
			)}
		</div>
	);
};
