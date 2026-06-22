import {
	FileTextOutlined,
	MessageOutlined,
	PaperClipOutlined,
	PlusOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Popover } from "antd";
import { useState } from "react";
import type * as React from "react";

export interface ChatToolsMenuProps {
	onAttachment: () => void;
	onPromptTemplate: () => void;
	onQuote: () => void;
	onTools: () => void;
}

interface MenuItem {
	key: string;
	label: string;
	icon: React.ReactNode;
	onClick: () => void;
}

export function ChatToolsMenu({
	onAttachment,
	onPromptTemplate,
	onQuote,
	onTools,
}: ChatToolsMenuProps) {
	const [open, setOpen] = useState(false);

	const items: MenuItem[] = [
		{
			key: "attach",
			label: "附件",
			icon: <PaperClipOutlined />,
			onClick: onAttachment,
		},
		{
			key: "prompt",
			label: "Prompt 模板",
			icon: <FileTextOutlined />,
			onClick: onPromptTemplate,
		},
		{
			key: "quote",
			label: "引用消息",
			icon: <MessageOutlined />,
			onClick: onQuote,
		},
		{ key: "tools", label: "Tools", icon: <ToolOutlined />, onClick: onTools },
	];

	const handleItem = (item: MenuItem) => {
		setOpen(false);
		requestAnimationFrame(() => item.onClick());
	};

	const content = (
		<div className="flex flex-col" style={{ minWidth: 160 }}>
			{items.map((item) => (
				<button
					key={item.key}
					type="button"
					onClick={() => handleItem(item)}
					className="flex items-center gap-2 px-2 py-1.5 text-sm rounded transition-colors"
					style={{
						background: "transparent",
						border: "none",
						cursor: "pointer",
						color: "inherit",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = "rgba(0,0,0,0.04)";
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
					}}
				>
					<span className="w-4 flex items-center justify-center">
						{item.icon}
					</span>
					<span className="flex-1 text-left">{item.label}</span>
				</button>
			))}
		</div>
	);

	return (
		<Popover
			open={open}
			onOpenChange={setOpen}
			content={content}
			trigger="click"
			placement="topLeft"
		>
			<button
				type="button"
				className={`composer-pill is-icon${open ? " is-active" : ""}`}
				aria-label="工具"
			>
				<PlusOutlined />
			</button>
		</Popover>
	);
}
