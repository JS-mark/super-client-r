import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Button, Tooltip } from "antd";
import {
	LeftOutlined,
	RightOutlined,
	DownloadOutlined,
	DeleteOutlined,
	ZoomInOutlined,
	ZoomOutOutlined,
	CloseOutlined,
} from "@ant-design/icons";
import { cn } from "../../lib/utils";
import type { Attachment } from "../../stores/attachmentStore";

interface ImageGalleryProps {
	attachments: Attachment[];
	currentIndex?: number;
	isOpen: boolean;
	onClose: () => void;
	onDelete?: (id: string) => void;
	allowDownload?: boolean;
	allowDelete?: boolean;
}

export function ImageGallery({
	attachments,
	currentIndex = 0,
	isOpen,
	onClose,
	onDelete,
	allowDownload = true,
	allowDelete = false,
}: ImageGalleryProps) {
	const { t } = useTranslation();
	const [index, setIndex] = useState(currentIndex);
	const [scale, setScale] = useState(1);
	const [isLoading, setIsLoading] = useState(true);

	const currentImage = attachments[index];
	const totalImages = attachments.length;

	const handlePrev = useCallback(() => {
		setIndex((prev) => (prev > 0 ? prev - 1 : totalImages - 1));
		setScale(1);
		setIsLoading(true);
	}, [totalImages]);

	const handleNext = useCallback(() => {
		setIndex((prev) => (prev < totalImages - 1 ? prev + 1 : 0));
		setScale(1);
		setIsLoading(true);
	}, [totalImages]);

	const handleZoomIn = () => {
		setScale((prev) => Math.min(prev + 0.25, 3));
	};

	const handleZoomOut = () => {
		setScale((prev) => Math.max(prev - 0.25, 0.5));
	};

	const handleDownload = () => {
		if (!currentImage?.url) return;

		const link = document.createElement("a");
		link.href = currentImage.url;
		link.download = currentImage.name;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	const handleDelete = () => {
		if (!currentImage) return;
		onDelete?.(currentImage.id);
		if (totalImages <= 1) {
			onClose();
		} else {
			handleNext();
		}
	};

	if (!currentImage) return null;

	return (
		<Modal
			open={isOpen}
			onCancel={onClose}
			footer={null}
			width="90vw"
			styles={{
				body: { padding: 0, height: "90vh", overflow: "hidden" },
			}}
			closable={false}
		>
			<div className="relative w-full h-full flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
					<div className="text-white">
						<span className="font-medium">{currentImage.name}</span>
						<span className="ml-2 text-sm text-white/60">
							{index + 1} / {totalImages}
						</span>
					</div>
					<div className="flex items-center gap-2">
						{allowDownload && (
							<Tooltip title={t("download", "下载", { ns: "common" })}>
								<Button
									type="text"
									icon={<DownloadOutlined />}
									onClick={handleDownload}
									className="text-white hover:text-white/80"
								/>
							</Tooltip>
						)}
						{allowDelete && (
							<Tooltip title={t("delete", "删除", { ns: "common" })}>
								<Button
									type="text"
									icon={<DeleteOutlined />}
									onClick={handleDelete}
									className="text-white hover:text-red-400"
								/>
							</Tooltip>
						)}
						<Tooltip title={t("close", "关闭", { ns: "common" })}>
							<Button
								type="text"
								icon={<CloseOutlined />}
								onClick={onClose}
								className="text-white hover:text-white/80"
							/>
						</Tooltip>
					</div>
				</div>

				{/* Image container */}
				<div className="flex-1 relative flex items-center justify-center overflow-hidden p-4">
					{/* Loading indicator */}
					{isLoading && (
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						</div>
					)}

					{/* Image */}
					<img
						src={currentImage.url || currentImage.path}
						alt={currentImage.name}
						className="max-w-full max-h-full object-contain transition-transform duration-200"
						style={{ transform: `scale(${scale})` }}
						onLoad={() => setIsLoading(false)}
						onError={() => setIsLoading(false)}
					/>

					{/* Navigation arrows */}
					{totalImages > 1 && (
						<>
							<button
								onClick={handlePrev}
								className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
							>
								<LeftOutlined />
							</button>
							<button
								onClick={handleNext}
								className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
							>
								<RightOutlined />
							</button>
						</>
					)}
				</div>

				{/* Footer toolbar */}
				<div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-white/10">
					<Button
						type="text"
						icon={<ZoomOutOutlined />}
						onClick={handleZoomOut}
						className="text-white hover:text-white/80"
						disabled={scale <= 0.5}
					>
						{t("zoomOut", "缩小", { ns: "common" })}
					</Button>
					<span className="text-white/60 min-w-[60px] text-center">
						{Math.round(scale * 100)}%
					</span>
					<Button
						type="text"
						icon={<ZoomInOutlined />}
						onClick={handleZoomIn}
						className="text-white hover:text-white/80"
						disabled={scale >= 3}
					>
						{t("zoomIn", "放大", { ns: "common" })}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

// Thumbnail grid for displaying multiple images
interface ImageThumbnailGridProps {
	attachments: Attachment[];
	maxDisplay?: number;
	onImageClick?: (index: number) => void;
	onRemove?: (id: string) => void;
	className?: string;
}

export function ImageThumbnailGrid({
	attachments,
	maxDisplay = 4,
	onImageClick,
	onRemove,
	className,
}: ImageThumbnailGridProps) {
	const displayAttachments = attachments.slice(0, maxDisplay);
	const remainingCount = attachments.length - maxDisplay;

	return (
		<div className={cn("flex flex-wrap gap-2", className)}>
			{displayAttachments.map((attachment, index) => (
				<div
					key={attachment.id}
					className="relative group"
					onClick={() => onImageClick?.(index)}
				>
					<div
						className={cn(
							"w-20 h-20 rounded-lg overflow-hidden cursor-pointer",
							"border border-slate-200",
							"hover:border-blue-500 transition-colors",
						)}
					>
						<img
							src={attachment.url || attachment.path}
							alt={attachment.name}
							className="w-full h-full object-cover"
						/>
						{index === maxDisplay - 1 && remainingCount > 0 && (
							<div className="absolute inset-0 bg-black/60 flex items-center justify-center">
								<span className="text-white font-medium">
									+{remainingCount}
								</span>
							</div>
						)}
					</div>
					{onRemove && (
						<button
							onClick={(e) => {
								e.stopPropagation();
								onRemove(attachment.id);
							}}
							className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white
								   flex items-center justify-center opacity-0 group-hover:opacity-100
								   transition-opacity text-xs"
						>
							<CloseOutlined />
						</button>
					)}
				</div>
			))}
		</div>
	);
}
