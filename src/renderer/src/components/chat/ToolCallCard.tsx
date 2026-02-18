import {
	CheckCircleOutlined,
	CloseCircleOutlined,
	LoadingOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { ThoughtChain } from "@ant-design/x";
import type * as React from "react";
import { useMemo } from "react";
import type { Message } from "../../stores/chatStore";

const STATUS_MAP = {
	pending: "loading",
	success: "success",
	error: "error",
} as const;

const STATUS_ICON: Record<string, React.ReactNode> = {
	pending: <LoadingOutlined spin />,
	success: <CheckCircleOutlined />,
	error: <CloseCircleOutlined />,
};

export const ToolCallCard: React.FC<{
	toolCall: NonNullable<Message["toolCall"]>;
}> = ({ toolCall }) => {
	const items = useMemo(
		() => [
			{
				key: toolCall.id,
				title: toolCall.name,
				icon: STATUS_ICON[toolCall.status] || <ToolOutlined />,
				status: STATUS_MAP[toolCall.status] as
					| "loading"
					| "success"
					| "error",
				description:
					toolCall.duration !== undefined
						? `${toolCall.duration}ms`
						: undefined,
				content: (
					<div className="space-y-2 text-xs">
						<div>
							<div className="font-medium text-slate-500 mb-1">
								Input
							</div>
							<pre className="bg-slate-50 rounded-lg p-2 overflow-auto max-h-24 text-slate-700">
								{JSON.stringify(toolCall.input, null, 2)}
							</pre>
						</div>
						{toolCall.result !== undefined && (
							<div>
								<div className="font-medium text-slate-500 mb-1">
									Result
								</div>
								<pre className="bg-slate-50 rounded-lg p-2 overflow-auto max-h-32 text-slate-700">
									{typeof toolCall.result === "string"
										? toolCall.result
										: JSON.stringify(
												toolCall.result,
												null,
												2,
											)}
								</pre>
							</div>
						)}
						{toolCall.error && (
							<div className="bg-red-50 text-red-600 rounded-lg p-2">
								{toolCall.error}
							</div>
						)}
					</div>
				),
				collapsible: true,
			},
		],
		[toolCall],
	);

	return (
		<div className="my-3">
			<ThoughtChain items={items} line="dashed" />
		</div>
	);
};
