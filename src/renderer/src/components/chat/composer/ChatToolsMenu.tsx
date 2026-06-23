import {
	FileTextOutlined,
	MessageOutlined,
	PaperClipOutlined,
	PlusOutlined,
	ToolOutlined,
} from "@ant-design/icons";
import { Popover, theme } from "antd";
import { useState } from "react";
import type * as React from "react";
import { useTranslation } from "react-i18next";

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

interface MenuSection {
	title?: string;
	items: MenuItem[];
}

export function ChatToolsMenu({
	onAttachment,
	onPromptTemplate,
	onQuote,
	onTools,
}: ChatToolsMenuProps) {
	const { t } = useTranslation();
	const { token } = theme.useToken();
	const [open, setOpen] = useState(false);

	const sections: MenuSection[] = [
		{
			title: t("composer.menu.title", "添加", { ns: "chat" }),
			items: [
				{
					key: "attach",
					label: t("composer.menu.attach", "附件", { ns: "chat" }),
					icon: <PaperClipOutlined />,
					onClick: onAttachment,
				},
				{
					key: "prompt",
					label: t("composer.menu.promptTemplate", "Prompt 模板", {
						ns: "chat",
					}),
					icon: <FileTextOutlined />,
					onClick: onPromptTemplate,
				},
				{
					key: "quote",
					label: t("composer.menu.quote", "引用消息", { ns: "chat" }),
					icon: <MessageOutlined />,
					onClick: onQuote,
				},
				{
					key: "tools",
					label: t("composer.menu.tools", "Tools", { ns: "chat" }),
					icon: <ToolOutlined />,
					onClick: onTools,
				},
			],
		},
	];

	const handleItem = (item: MenuItem) => {
		setOpen(false);
		// Defer the action until after the popover starts closing so the
		// dismiss animation doesn't fight with the next panel mounting.
		requestAnimationFrame(() => item.onClick());
	};

	const content = (
		<div style={{ minWidth: 220 }}>
			{sections.map((section, sectionIdx) => (
				<div
					key={section.title ?? `section-${sectionIdx}`}
					className={sectionIdx > 0 ? "mt-1" : undefined}
				>
					{section.title ? (
						<div
							className="px-2 py-1.5 text-xs"
							style={{ color: token.colorTextDescription }}
						>
							{section.title}
						</div>
					) : null}
					<div className="flex flex-col gap-0.5">
						{section.items.map((item) => (
							<button
								key={item.key}
								type="button"
								onClick={() => handleItem(item)}
								className="flex items-center gap-2.5 text-sm transition-colors"
								style={{
									padding: "8px 10px",
									borderRadius: 8,
									background: "transparent",
									border: "none",
									cursor: "pointer",
									color: token.colorText,
									textAlign: "left",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = token.colorFillTertiary;
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "transparent";
								}}
							>
								<span
									className="w-4 h-4 flex items-center justify-center shrink-0"
									style={{ color: token.colorTextSecondary }}
								>
									{item.icon}
								</span>
								<span className="flex-1">{item.label}</span>
							</button>
						))}
					</div>
				</div>
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
			arrow={false}
			styles={{
				container: { padding: 6, borderRadius: 12 },
			}}
		>
			<button
				type="button"
				className={`composer-pill is-icon${open ? " is-active" : ""}`}
				aria-label={t("composer.menu.triggerAriaLabel", "添加", { ns: "chat" })}
			>
				<PlusOutlined />
			</button>
		</Popover>
	);
}
