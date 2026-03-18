import {
	BulbOutlined,
	FileTextOutlined,
	LeftOutlined,
	PlusOutlined,
	RightOutlined,
	SearchOutlined,
	TagsOutlined,
	ToolOutlined,
	TranslationOutlined,
} from "@ant-design/icons";
import { App, Button, Flex, Tooltip, theme } from "antd";
import type * as React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUploadButton } from "../../attachment/FileUpload";
import type { Attachment } from "../../../stores/attachmentStore";
import type { PromptTemplate } from "./PromptTemplatePanel";
import { PromptTemplatePanel } from "./PromptTemplatePanel";
import { QuotePanel } from "./QuotePanel";
import { ToolsPanel } from "./ToolsPanel";
import type { ToolItem } from "./ToolsPanel";
import type { Message } from "../../../stores/chatStore";

const { useToken } = theme;

// Toolbar item definition
interface ToolbarItem {
	id: string;
	icon: React.ReactNode;
	label: string;
}

// Primary toolbar items - always visible
const PRIMARY_TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "quote", icon: <PlusOutlined />, label: "toolbar.quote" },
	{ id: "prompt", icon: <BulbOutlined />, label: "toolbar.prompt" },
	{ id: "doc", icon: <FileTextOutlined />, label: "toolbar.doc" },
	{ id: "tools", icon: <ToolOutlined />, label: "toolbar.tools" },
];

// Extra toolbar items - shown when "More" is expanded
const EXTRA_TOOLBAR_ITEMS: ToolbarItem[] = [
	{ id: "tags", icon: <TagsOutlined />, label: "toolbar.tags" },
	{
		id: "translate",
		icon: <TranslationOutlined />,
		label: "toolbar.translate",
	},
];

interface ChatToolbarProps {
	conversationId: string;
	selectedEngine: string;
	onSelectEngine: (engine: string) => void;
	hasSearchEngines: boolean;
	currentEngine: { id: string; name: string; icon: React.ReactNode } | null;
	searchPopoverOpen: boolean;
	onSearchPopoverToggle: () => void;
	onUploadComplete: (attachments: Attachment[]) => void;
	onPromptSelect: (template: PromptTemplate) => void;
	onQuoteSelect: (message: Message) => void;
	onToolSelect: (tool: ToolItem) => void;
}

export function ChatToolbar({
	conversationId,
	selectedEngine,
	hasSearchEngines,
	currentEngine,
	searchPopoverOpen,
	onSearchPopoverToggle,
	onUploadComplete,
	onPromptSelect,
	onQuoteSelect,
	onToolSelect,
}: ChatToolbarProps) {
	const { t } = useTranslation();
	const { token } = useToken();
	const { message } = App.useApp();
	const [toolbarExpanded, setToolbarExpanded] = useState(false);
	const [promptPanelOpen, setPromptPanelOpen] = useState(false);
	const [quotePanelOpen, setQuotePanelOpen] = useState(false);
	const [toolsPanelOpen, setToolsPanelOpen] = useState(false);

	/** Close all toolbar panels */
	const closeAllPanels = useCallback(() => {
		setPromptPanelOpen(false);
		setQuotePanelOpen(false);
		setToolsPanelOpen(false);
	}, []);

	const handleToolbarClick = useCallback(
		(itemId: string) => {
			// Toggle panel for implemented buttons, close others
			if (itemId === "prompt") {
				setQuotePanelOpen(false);
				setPromptPanelOpen((v) => !v);
				return;
			}
			if (itemId === "quote") {
				setPromptPanelOpen(false);
				setToolsPanelOpen(false);
				setQuotePanelOpen((v) => !v);
				return;
			}
			if (itemId === "tools") {
				setPromptPanelOpen(false);
				setQuotePanelOpen(false);
				setToolsPanelOpen((v) => !v);
				return;
			}
			closeAllPanels();

			switch (itemId) {
				case "doc":
					message.info(
						t("toolbar.docComingSoon", "文档功能即将推出", { ns: "chat" }),
					);
					break;
				default:
					message.info(t(`toolbar.${itemId}`, { ns: "chat" }));
					break;
			}
		},
		[t, message, closeAllPanels],
	);

	const handlePromptSelect = useCallback(
		(template: PromptTemplate) => {
			onPromptSelect(template);
			closeAllPanels();
		},
		[onPromptSelect, closeAllPanels],
	);

	const handleQuoteSelect = useCallback(
		(msg: Message) => {
			onQuoteSelect(msg);
			closeAllPanels();
		},
		[onQuoteSelect, closeAllPanels],
	);

	const handleToolSelect = useCallback(
		(tool: ToolItem) => {
			onToolSelect(tool);
			closeAllPanels();
		},
		[onToolSelect, closeAllPanels],
	);

	return (
		<>
			{/* Prompt Template Panel */}
			{promptPanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<PromptTemplatePanel
						onSelect={handlePromptSelect}
						onClose={() => closeAllPanels()}
					/>
				</div>
			)}

			{/* Quote Panel */}
			{quotePanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<QuotePanel
						onSelect={handleQuoteSelect}
						onClose={() => closeAllPanels()}
					/>
				</div>
			)}

			{/* Tools Panel */}
			{toolsPanelOpen && (
				<div className="absolute bottom-full left-0 right-0 mb-2 shadow-lg rounded-lg overflow-hidden z-50">
					<ToolsPanel
						onSelect={handleToolSelect}
						onClose={() => closeAllPanels()}
					/>
				</div>
			)}

			<Flex align="center" gap={4}>
				{/* File upload */}
				<FileUploadButton
					onUploadComplete={onUploadComplete}
					conversationId={conversationId}
				/>

				{/* Primary toolbar items */}
				{PRIMARY_TOOLBAR_ITEMS.map((item) => {
					const isActive =
						(item.id === "prompt" && promptPanelOpen) ||
						(item.id === "quote" && quotePanelOpen) ||
						(item.id === "tools" && toolsPanelOpen);
					return (
						<Tooltip
							key={item.id}
							title={t(item.label, { ns: "chat" })}
						>
							<Button
								type="text"
								size="small"
								icon={item.icon}
								onClick={() => handleToolbarClick(item.id)}
								style={
									isActive
										? { backgroundColor: token.colorBgTextHover }
										: undefined
								}
							/>
						</Tooltip>
					);
				})}

				{/* Search engine - only show when engines are configured */}
				{hasSearchEngines && (
					<Tooltip
						title={t("chat.toolbar.search", "搜索", { ns: "chat" })}
					>
						<Button
							type="text"
							size="small"
							icon={currentEngine?.icon ?? <SearchOutlined />}
							onClick={onSearchPopoverToggle}
							style={
								searchPopoverOpen
									? { backgroundColor: token.colorBgTextHover }
									: selectedEngine
										? { color: token.colorPrimary }
										: undefined
							}
						/>
					</Tooltip>
				)}

				{/* Extra items - visible when expanded */}
				{toolbarExpanded && (
					<>
						<div
							className="w-px h-3 opacity-25"
							style={{ backgroundColor: token.colorBorder }}
						/>
						{EXTRA_TOOLBAR_ITEMS.map((item) => (
							<Tooltip
								key={item.id}
								title={t(item.label, { ns: "chat" })}
							>
								<Button
									type="text"
									size="small"
									icon={item.icon}
									onClick={() => handleToolbarClick(item.id)}
								/>
							</Tooltip>
						))}
					</>
				)}

				<div
					className="w-px h-3 opacity-25"
					style={{ backgroundColor: token.colorBorder }}
				/>

				{/* More / Collapse toggle */}
				<Tooltip
					title={
						toolbarExpanded
							? t("toolbar.collapse", "收起", { ns: "chat" })
							: t("toolbar.more", "更多", { ns: "chat" })
					}
				>
					<Button
						type="text"
						size="small"
						icon={toolbarExpanded ? <LeftOutlined /> : <RightOutlined />}
						onClick={() => setToolbarExpanded((prev) => !prev)}
					/>
				</Tooltip>
			</Flex>
		</>
	);
}

export type { ChatToolbarProps };
