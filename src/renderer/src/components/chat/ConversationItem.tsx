import {
	CheckOutlined,
	CloseOutlined,
	DeleteOutlined,
	EditOutlined,
	MoreOutlined,
} from "@ant-design/icons";
import { Button, Dropdown, Input, theme } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationSummary } from "../../types/electron";

const { useToken } = theme;

interface ConversationItemProps {
	conversation: ConversationSummary;
	isActive: boolean;
	onClick: () => void;
	onRename: (name: string) => void;
	onDelete: () => void;
}

function formatRelativeTime(
	timestamp: number,
	t: (key: string, defaultValue: string, options?: Record<string, unknown>) => string,
): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);

	if (minutes < 1) return t("sidebar.justNow", "just now");
	if (minutes < 60) return t("sidebar.minutesAgo", "{{count}}m", { count: minutes });
	if (hours < 24) return t("sidebar.hoursAgo", "{{count}}h", { count: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return t("sidebar.daysAgo", "{{count}}d", { count: days });
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function ConversationItem({
	conversation,
	isActive,
	onClick,
	onRename,
	onDelete,
}: ConversationItemProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const [isEditing, setIsEditing] = useState(false);
	const [editName, setEditName] = useState(conversation.name);
	const inputRef = useRef<any>(null);

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [isEditing]);

	const handleStartEdit = useCallback(() => {
		setEditName(conversation.name);
		setIsEditing(true);
	}, [conversation.name]);

	const handleConfirmEdit = useCallback(() => {
		const trimmed = editName.trim();
		if (trimmed && trimmed !== conversation.name) {
			onRename(trimmed);
		}
		setIsEditing(false);
	}, [editName, conversation.name, onRename]);

	const handleCancelEdit = useCallback(() => {
		setIsEditing(false);
		setEditName(conversation.name);
	}, [conversation.name]);

	const menuItems = [
		{
			key: "rename",
			icon: <EditOutlined />,
			label: t("sidebar.rename", "Rename"),
			onClick: handleStartEdit,
		},
		{
			type: "divider" as const,
		},
		{
			key: "delete",
			icon: <DeleteOutlined />,
			label: t("sidebar.delete", "Delete"),
			danger: true,
			onClick: onDelete,
		},
	];

	return (
		<div
			className="group relative flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150"
			style={{
				backgroundColor: isActive ? token.colorBgTextHover : undefined,
				borderLeft: isActive
					? `3px solid ${token.colorPrimary}`
					: "3px solid transparent",
			}}
			onClick={isEditing ? undefined : onClick}
			onDoubleClick={handleStartEdit}
		>
			<div className="flex-1 min-w-0">
				{isEditing ? (
					<div className="flex items-center gap-1">
						<Input
							ref={inputRef}
							size="small"
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							onPressEnter={handleConfirmEdit}
							onKeyDown={(e) => {
								if (e.key === "Escape") handleCancelEdit();
							}}
							onBlur={handleConfirmEdit}
							className="text-sm"
						/>
						<Button
							type="text"
							size="small"
							icon={<CheckOutlined />}
							onClick={(e) => {
								e.stopPropagation();
								handleConfirmEdit();
							}}
						/>
						<Button
							type="text"
							size="small"
							icon={<CloseOutlined />}
							onClick={(e) => {
								e.stopPropagation();
								handleCancelEdit();
							}}
						/>
					</div>
				) : (
					<>
						<div
							className="text-sm font-medium truncate"
							style={{ color: token.colorText }}
						>
							{conversation.name}
						</div>
						{conversation.preview && (
							<div
								className="text-xs truncate mt-0.5"
								style={{ color: token.colorTextTertiary }}
							>
								{conversation.preview}
							</div>
						)}
					</>
				)}
			</div>

			{!isEditing && (
				<div className="flex items-center gap-1 shrink-0">
					<span
						className="text-xs group-hover:hidden"
						style={{ color: token.colorTextQuaternary }}
					>
						{formatRelativeTime(conversation.updatedAt, t)}
					</span>
					<Dropdown
						menu={{ items: menuItems }}
						trigger={["click"]}
						placement="bottomRight"
					>
						<Button
							type="text"
							size="small"
							icon={<MoreOutlined />}
							className="hidden group-hover:inline-flex"
							style={{ color: token.colorTextTertiary }}
							onClick={(e) => e.stopPropagation()}
						/>
					</Dropdown>
				</div>
			)}
		</div>
	);
}
