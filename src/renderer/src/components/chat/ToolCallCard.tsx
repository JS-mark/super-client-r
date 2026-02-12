import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import type * as React from "react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import type { Message } from "../../stores/chatStore";

export const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
}> = ({ toolCall }) => {
	const [isExpanded, setIsExpanded] = useState(true);

	const statusConfig = {
		pending: {
			color: "blue",
			icon: <LoadingOutlined className="animate-spin" />,
			bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
		},
		success: {
			color: "green",
			icon: <CheckCircleOutlined />,
			bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
		},
		error: {
			color: "red",
			icon: <CloseCircleOutlined />,
			bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
		},
	}[toolCall.status];

	return (
		<div
			className={cn(
				"my-3 rounded-xl border overflow-hidden transition-all",
				statusConfig.bg,
			)}
		>
			<button
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
			>
				<span className={cn("text-lg", `text-${statusConfig.color}-500`)}>
					{statusConfig.icon}
				</span>
				<div className="flex-1 text-left">
					<div className="font-medium text-sm text-slate-800 dark:text-slate-200">
						{toolCall.name}
					</div>
					<div className="text-xs text-slate-500 capitalize">
						{toolCall.status}
					</div>
				</div>
				<span className="text-xs text-slate-400">{isExpanded ? "▼" : "▶"}</span>
			</button>

			{isExpanded && (
				<div className="px-4 pb-4 space-y-3">
					<div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-3">
						<div className="text-xs font-medium text-slate-500 mb-1">Input</div>
						<pre className="text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-24">
							{JSON.stringify(toolCall.input, null, 2)}
						</pre>
					</div>

					{toolCall.result !== undefined && (
						<div className="bg-white/50 dark:bg-slate-900/50 rounded-lg p-3">
							<div className="text-xs font-medium text-slate-500 mb-1">
								Result
							</div>
							<pre className="text-xs text-slate-700 dark:text-slate-300 overflow-auto max-h-32">
								{typeof toolCall.result === "string"
									? toolCall.result
									: JSON.stringify(toolCall.result, null, 2)}
							</pre>
						</div>
					)}

					{toolCall.error && (
						<div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg p-3 text-sm">
							{toolCall.error}
						</div>
					)}

					{toolCall.duration !== undefined && (
						<div className="text-right text-xs text-slate-400">
							Duration: {toolCall.duration}ms
						</div>
					)}
				</div>
			)}
		</div>
	);
};
