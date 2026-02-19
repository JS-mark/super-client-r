import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	Button,
	Input,
	Empty,
	Dropdown,
	message,
	Badge,
} from "antd";
import {
	SearchOutlined,
	DeleteOutlined,
	DownloadOutlined,
	EyeOutlined,
	MoreOutlined,
	FilterOutlined,
	PaperClipOutlined,
} from "@ant-design/icons";
import { cn } from "../../lib/utils";
import {
	useAttachmentStore,
	type Attachment,
	type AttachmentType,
} from "../../stores/attachmentStore";
import { FileIcon, formatFileSize } from "./FileIcon";
import { ImageGallery } from "./ImageGallery";

const ATTACHMENT_TYPES: { type: AttachmentType | "all"; label: string; icon: string }[] = [
	{ type: "all", label: "all", icon: "📎" },
	{ type: "image", label: "image", icon: "🖼️" },
	{ type: "document", label: "document", icon: "📄" },
	{ type: "code", label: "code", icon: "💻" },
	{ type: "audio", label: "audio", icon: "🎵" },
	{ type: "video", label: "video", icon: "🎬" },
	{ type: "archive", label: "archive", icon: "📦" },
	{ type: "other", label: "other", icon: "📋" },
];

interface AttachmentManagerProps {
	conversationId?: string;
	messageId?: string;
	onSelect?: (attachments: Attachment[]) => void;
	selectable?: boolean;
	className?: string;
}

export function AttachmentManager({
	conversationId,
	messageId,
	onSelect,
	selectable = false,
	className,
}: AttachmentManagerProps) {
	const { t } = useTranslation();
	const {
		attachments,
		isLoading,
		selectedAttachments,
		selectAttachment,
		deselectAttachment,
		clearSelection,
		deleteAttachment,
		openAttachment,
	} = useAttachmentStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [activeType, setActiveType] = useState<AttachmentType | "all">("all");
	const [galleryOpen, setGalleryOpen] = useState(false);
	const [galleryIndex, setGalleryIndex] = useState(0);

	// Filter attachments
	const filteredAttachments = useMemo(() => {
		return attachments.filter((attachment) => {
			// Filter by conversation/message if specified
			if (conversationId && attachment.conversationId !== conversationId) return false;
			if (messageId && attachment.messageId !== messageId) return false;

			// Filter by type
			if (activeType !== "all" && attachment.type !== activeType) return false;

			// Filter by search query
			if (searchQuery) {
				const query = searchQuery.toLowerCase();
				return (
					attachment.name.toLowerCase().includes(query) ||
					attachment.originalName.toLowerCase().includes(query)
				);
			}

			return true;
		});
	}, [attachments, conversationId, messageId, activeType, searchQuery]);

	// Get image attachments for gallery
	const imageAttachments = useMemo(
		() => filteredAttachments.filter((a) => a.type === "image"),
		[filteredAttachments]
	);

	const handleOpenGallery = (index: number) => {
		setGalleryIndex(index);
		setGalleryOpen(true);
	};

	const handleDelete = async (id: string) => {
		const success = await deleteAttachment(id);
		if (success) {
			message.success(t("attachment.delete.success", { ns: "attachment" }));
		} else {
			message.error(t("attachment.delete.error", { ns: "attachment" }));
		}
	};

	const handleDownload = (attachment: Attachment) => {
		if (attachment.url) {
			const link = document.createElement("a");
			link.href = attachment.url;
			link.download = attachment.name;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			message.success(t("attachment.download.success", { ns: "attachment" }));
		} else {
			openAttachment(attachment.id);
		}
	};

	const handleSelect = (attachment: Attachment) => {
		if (!selectable) return;

		if (selectedAttachments.includes(attachment.id)) {
			deselectAttachment(attachment.id);
		} else {
			selectAttachment(attachment.id);
		}
	};

	const handleConfirmSelection = () => {
		const selected = attachments.filter((a) => selectedAttachments.includes(a.id));
		onSelect?.(selected);
	};

	// Get file extension
	const getExtension = (filename: string) => {
		const parts = filename.split(".");
		return parts.length > 1 ? parts.pop()?.toLowerCase() : "";
	};

	return (
		<div className={cn("flex flex-col h-full", className)}>
			{/* Header */}
			<div className="flex items-center gap-2 p-4 border-b border-slate-200 ">
				<div className="flex-1 relative">
					<Input
						prefix={<SearchOutlined className="text-slate-400" />}
						placeholder={t("attachment.search.placeholder", { ns: "attachment" })}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						allowClear
					/>
				</div>
				<Dropdown
					menu={{
						items: ATTACHMENT_TYPES.map((itemType) => ({
							key: itemType.type,
							icon: <span>{itemType.icon}</span>,
							label: t(`attachment.type.${itemType.label}`),
							onClick: () => setActiveType(itemType.type),
						})),
					}}
					trigger={["click"]}
				>
					<Button icon={<FilterOutlined />}>
						{t("attachment.filter.label", "筛选", { ns: "attachment" })}
					</Button>
				</Dropdown>
			</div>

			{/* Type tabs */}
			<div className="flex gap-1 p-2 overflow-x-auto border-b border-slate-200 ">
				{ATTACHMENT_TYPES.map((type) => (
					<button
						key={type.type}
						onClick={() => setActiveType(type.type)}
						className={cn(
							"px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors",
							activeType === type.type
								? "bg-blue-100 text-blue-700  "
								: "text-slate-600  hover:bg-slate-100 "
						)}
					>
						<span className="mr-1">{type.icon}</span>
						{t(`attachment.type.${type.label}`)}
					</button>
				))}
			</div>

			{/* Attachment list */}
			<div className="flex-1 overflow-y-auto p-4">
				{isLoading ? (
					<div className="flex items-center justify-center h-full">
						<div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
					</div>
				) : filteredAttachments.length === 0 ? (
					<Empty
						image={
							<div className="text-4xl mb-2">
								<PaperClipOutlined />
							</div>
						}
						description={t("attachment.empty.description", "暂无附件", { ns: "attachment" })}
						className="mt-12"
					/>
				) : (
					<div className="space-y-2">
						{filteredAttachments.map((attachment) => (
							<AttachmentItem
								key={attachment.id}
								attachment={attachment}
								isSelected={selectedAttachments.includes(attachment.id)}
								selectable={selectable}
								onSelect={() => handleSelect(attachment)}
								onOpen={() =>
									attachment.type === "image"
										? handleOpenGallery(
												imageAttachments.findIndex((a) => a.id === attachment.id)
											)
										: openAttachment(attachment.id)
								}
								onDownload={() => handleDownload(attachment)}
								onDelete={() => handleDelete(attachment.id)}
								extension={getExtension(attachment.name)}
							/>
						))}
					</div>
				)}
			</div>

			{/* Selection footer */}
			{selectable && selectedAttachments.length > 0 && (
				<div className="flex items-center justify-between p-4 border-t border-slate-200  bg-slate-50 ">
					<span className="text-sm text-slate-600 ">
						{t("attachment.selected", "已选择 {{count}} 个", {
							count: selectedAttachments.length,
						})}
					</span>
					<div className="flex gap-2">
						<Button onClick={clearSelection}>
							{t("cancel", "取消", { ns: "common" })}
						</Button>
						<Button type="primary" onClick={handleConfirmSelection}>
							{t("confirm", "确认", { ns: "common" })}
						</Button>
					</div>
				</div>
			)}

			{/* Image Gallery */}
			<ImageGallery
				attachments={imageAttachments}
				currentIndex={galleryIndex}
				isOpen={galleryOpen}
				onClose={() => setGalleryOpen(false)}
				onDelete={(id) => handleDelete(id)}
				allowDelete={true}
			/>
		</div>
	);
}

// Individual attachment item component
interface AttachmentItemProps {
	attachment: Attachment;
	isSelected?: boolean;
	selectable?: boolean;
	onSelect?: () => void;
	onOpen?: () => void;
	onDownload?: () => void;
	onDelete?: () => void;
	extension?: string;
}

function AttachmentItem({
	attachment,
	isSelected,
	selectable,
	onSelect,
	onOpen,
	onDownload,
	onDelete,
	extension,
}: AttachmentItemProps) {
	const { t } = useTranslation();
	const isImage = attachment.type === "image";

	const menuItems = [
		{
			key: "open",
			icon: <EyeOutlined />,
			label: t("open", "打开", { ns: "common" }),
			onClick: onOpen,
		},
		{
			key: "download",
			icon: <DownloadOutlined />,
			label: t("download", "下载", { ns: "common" }),
			onClick: onDownload,
		},
		{
			key: "delete",
			icon: <DeleteOutlined />,
			label: t("delete", "删除", { ns: "common" }),
			danger: true,
			onClick: onDelete,
		},
	];

	return (
		<div
			className={cn(
				"flex items-center gap-3 p-3 rounded-lg border transition-colors",
				isSelected
					? "border-blue-500 bg-blue-50 "
					: "border-slate-200  hover:border-slate-300 ",
				selectable && "cursor-pointer"
			)}
			onClick={selectable ? onSelect : undefined}
		>
			{/* Thumbnail or Icon */}
			{isImage && attachment.url ? (
				<div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
					<img
						src={attachment.url}
						alt={attachment.name}
						className="w-full h-full object-cover"
					/>
				</div>
			) : (
				<FileIcon
					type={attachment.type}
					extension={extension}
					size="md"
				/>
			)}

			{/* Info */}
			<div className="flex-1 min-w-0">
				<p className="font-medium text-sm truncate">{attachment.originalName}</p>
				<div className="flex items-center gap-2 text-xs text-slate-500">
					<span>{formatFileSize(attachment.size)}</span>
					<span>•</span>
					<span>{new Date(attachment.createdAt).toLocaleDateString()}</span>
				</div>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-1">
				{!selectable && (
					<>
						<button
							onClick={(e) => {
								e.stopPropagation();
								onOpen?.();
							}}
							className="p-2 rounded-lg hover:bg-slate-100  text-slate-500"
							title={t("open", "打开", { ns: "common" })}
						>
							<EyeOutlined />
						</button>
						<Dropdown menu={{ items: menuItems }} trigger={["click"]}>
							<button
								onClick={(e) => e.stopPropagation()}
								className="p-2 rounded-lg hover:bg-slate-100  text-slate-500"
							>
								<MoreOutlined />
							</button>
						</Dropdown>
					</>
				)}
				{selectable && isSelected && (
					<div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
						<svg
							className="w-3 h-3 text-white"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
				)}
			</div>
		</div>
	);
}

// Compact attachment list for inline display
interface AttachmentListProps {
	attachments: Attachment[];
	onRemove?: (id: string) => void;
	maxDisplay?: number;
	className?: string;
}

export function AttachmentList({
	attachments,
	onRemove,
	maxDisplay = 3,
	className,
}: AttachmentListProps) {
	const displayAttachments = attachments.slice(0, maxDisplay);
	const remainingCount = attachments.length - maxDisplay;

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{displayAttachments.map((attachment) => (
				<div
					key={attachment.id}
					className="flex items-center gap-2 px-2 py-1 bg-slate-100  rounded-lg text-sm"
				>
					<FileIcon type={attachment.type} size="sm" />
					<span className="max-w-[120px] truncate">{attachment.name}</span>
					{onRemove && (
						<button
							onClick={() => onRemove(attachment.id)}
							className="ml-1 text-slate-400 hover:text-red-500"
						>
							×
						</button>
					)}
				</div>
			))}
			{remainingCount > 0 && (
				<Badge
					count={`+${remainingCount}`}
					className="bg-slate-200  text-slate-600 "
				/>
			)}
		</div>
	);
}
