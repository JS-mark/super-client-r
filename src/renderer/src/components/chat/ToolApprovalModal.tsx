import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { Button, Modal, Typography } from "antd";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

const { Text } = Typography;

interface ToolApprovalModalProps {
	open: boolean;
	toolName: string;
	toolArgs: string;
	onApprove: () => void;
	onReject: () => void;
}

export function ToolApprovalModal({
	open,
	toolName,
	toolArgs,
	onApprove,
	onReject,
}: ToolApprovalModalProps) {
	const { t } = useTranslation("chat");

	const formattedArgs = useMemo(() => {
		try {
			return JSON.stringify(JSON.parse(toolArgs), null, 2);
		} catch {
			return toolArgs;
		}
	}, [toolArgs]);

	const handleApprove = useCallback(() => {
		onApprove();
	}, [onApprove]);

	const handleReject = useCallback(() => {
		onReject();
	}, [onReject]);

	// Extract display name (remove server prefix)
	const displayName = useMemo(() => {
		const parts = toolName.split("__");
		return parts.length > 1 ? parts.slice(1).join("__") : toolName;
	}, [toolName]);

	return (
		<Modal
			title={t("approval.title", "Tool Approval")}
			open={open}
			onCancel={handleReject}
			footer={
				<div className="flex justify-end gap-2">
					<Button icon={<CloseOutlined />} onClick={handleReject}>
						{t("approval.reject", "Reject")}
					</Button>
					<Button
						type="primary"
						icon={<CheckOutlined />}
						onClick={handleApprove}
					>
						{t("approval.approve", "Allow")}
					</Button>
				</div>
			}
			width={480}
		>
			<div className="flex flex-col gap-3 py-2">
				<div>
					<Text type="secondary" className="text-xs">
						{t("approval.toolName", "Tool")}
					</Text>
					<div className="mt-1 px-3 py-1.5 rounded-md bg-[var(--ant-color-fill-quaternary)] font-mono text-sm">
						{displayName}
					</div>
				</div>
				<div>
					<Text type="secondary" className="text-xs">
						{t("approval.arguments", "Arguments")}
					</Text>
					<pre className="mt-1 px-3 py-2 rounded-md bg-[var(--ant-color-fill-quaternary)] text-xs overflow-auto max-h-[240px] whitespace-pre-wrap break-all">
						{formattedArgs}
					</pre>
				</div>
			</div>
		</Modal>
	);
}
