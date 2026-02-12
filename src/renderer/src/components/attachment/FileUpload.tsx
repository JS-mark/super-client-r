import { useState, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Upload, message, Progress } from "antd";
import { UploadOutlined, PaperClipOutlined, CloseOutlined } from "@ant-design/icons";
import { cn } from "../../lib/utils";
import { useAttachmentStore, type Attachment } from "../../stores/attachmentStore";
import { FileIcon, formatFileSize } from "./FileIcon";

interface FileUploadProps {
	onUploadComplete?: (attachments: Attachment[]) => void;
	onUploadError?: (error: string) => void;
	multiple?: boolean;
	accept?: string;
	maxSize?: number; // in bytes
	maxCount?: number;
	conversationId?: string;
	messageId?: string;
	className?: string;
	children?: React.ReactNode;
}

interface UploadingFile {
	id: string;
	name: string;
	size: number;
	progress: number;
	status: "uploading" | "done" | "error";
	error?: string;
}

export function FileUpload({
	onUploadComplete,
	onUploadError,
	multiple = true,
	accept,
	maxSize = 50 * 1024 * 1024, // 50MB default
	maxCount = 10,
	conversationId,
	messageId,
	className,
	children,
}: FileUploadProps) {
	const { t } = useTranslation();
	const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { uploadFile } = useAttachmentStore();

	const handleFileSelect = useCallback(async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		if (files.length > maxCount) {
			message.error(t("attachment.upload.maxCountError", { count: maxCount }));
			return;
		}

		const newUploadingFiles: UploadingFile[] = [];
		const fileArray = Array.from(files);

		// Validate files
		for (const file of fileArray) {
			if (file.size > maxSize) {
				message.error(
					t("attachment.upload.sizeError", {
						name: file.name,
						size: formatFileSize(maxSize),
					})
				);
				return;
			}

			newUploadingFiles.push({
				id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				name: file.name,
				size: file.size,
				progress: 0,
				status: "uploading",
			});
		}

		setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

		const completedAttachments: Attachment[] = [];

		// Upload files
		for (let i = 0; i < fileArray.length; i++) {
			const file = fileArray[i];
			const uploadingFile = newUploadingFiles[i];

			try {
				// Create a temporary URL for the file
				const tempUrl = URL.createObjectURL(file);

				// Update progress simulation
				const progressInterval = setInterval(() => {
					setUploadingFiles((prev) =>
						prev.map((f) =>
							f.id === uploadingFile.id
								? { ...f, progress: Math.min(f.progress + 10, 90) }
								: f
						)
					);
				}, 100);

				// In a real app, you would upload to server here
				// For now, we'll create a data URL for the file
				const reader = new FileReader();
				const fileContent = await new Promise<string>((resolve) => {
					reader.onloadend = () => resolve(reader.result as string);
					reader.readAsDataURL(file);
				});

				clearInterval(progressInterval);

				// Create attachment object
				const ext = file.name.split(".").pop() || "";
				const attachment: Attachment = {
					id: uploadingFile.id,
					name: file.name,
					originalName: file.name,
					path: tempUrl,
					size: file.size,
					mimeType: file.type || "application/octet-stream",
					type: getFileType(file.type, ext),
					createdAt: new Date().toISOString(),
					conversationId,
					messageId,
					url: fileContent,
				};

				completedAttachments.push(attachment);

				setUploadingFiles((prev) =>
					prev.map((f) =>
						f.id === uploadingFile.id
							? { ...f, progress: 100, status: "done" }
							: f
					)
				);

				// Add to store
				useAttachmentStore.getState().addAttachment(attachment);
			} catch (error) {
				const errorMsg = String(error);
				setUploadingFiles((prev) =>
					prev.map((f) =>
						f.id === uploadingFile.id
							? { ...f, status: "error", error: errorMsg }
							: f
					)
				);
				onUploadError?.(errorMsg);
			}
		}

		if (completedAttachments.length > 0) {
			onUploadComplete?.(completedAttachments);
			message.success(
				t("attachment.upload.success", { count: completedAttachments.length })
			);
		}

		// Clear completed uploads after a delay
		setTimeout(() => {
			setUploadingFiles((prev) =>
				prev.filter((f) => f.status === "uploading" || f.status === "error")
			);
		}, 3000);
	}, [multiple, maxSize, maxCount, conversationId, messageId, onUploadComplete, onUploadError, t]);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			handleFileSelect(e.dataTransfer.files);
		},
		[handleFileSelect]
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	}, []);

	const removeUploadingFile = (id: string) => {
		setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
	};

	return (
		<div className={cn("space-y-2", className)}>
			{/* Drop zone */}
			<div
				onDrop={handleDrop}
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				className={cn(
					"border-2 border-dashed rounded-lg p-4 transition-colors cursor-pointer",
					isDragging
						? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
						: "border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500"
				)}
				onClick={() => fileInputRef.current?.click()}
			>
				<input
					ref={fileInputRef}
					type="file"
					multiple={multiple}
					accept={accept}
					className="hidden"
					onChange={(e) => handleFileSelect(e.target.files)}
				/>
				<div className="flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400">
					{children || (
						<>
							<UploadOutlined className="text-2xl" />
							<span className="text-sm">
								{t("attachment.upload.dragOrClick", "点击或拖拽文件到此处上传", { ns: "attachment" })}
							</span>
							<span className="text-xs text-slate-400">
								{t("attachment.upload.maxSize", "最大 {{size}}", { size: formatFileSize(maxSize) })}
							</span>
						</>
					)}
				</div>
			</div>

			{/* Uploading files list */}
			{uploadingFiles.length > 0 && (
				<div className="space-y-2">
					{uploadingFiles.map((file) => (
						<div
							key={file.id}
							className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg"
						>
							<FileIcon
								type={getFileTypeFromName(file.name)}
								extension={file.name.split(".").pop()}
								size="sm"
							/>
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate">{file.name}</p>
								<p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
								{file.status === "uploading" && (
									<Progress
										percent={file.progress}
										size="small"
										showInfo={false}
									/>
								)}
								{file.status === "error" && (
									<p className="text-xs text-red-500">{file.error}</p>
								)}
							</div>
							<button
								onClick={(e) => {
									e.stopPropagation();
									removeUploadingFile(file.id);
								}}
								className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
							>
								<CloseOutlined className="text-xs" />
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function getFileType(mimeType: string, extension: string): Attachment["type"] {
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.includes("pdf") || mimeType.includes("word") || mimeType.includes("excel")) return "document";
	if (mimeType.includes("zip") || mimeType.includes("rar") || mimeType.includes("7z")) return "archive";
	if (mimeType.includes("javascript") || mimeType.includes("typescript") || mimeType.includes("json")) return "code";
	return getFileTypeFromName(extension);
}

function getFileTypeFromName(filename: string): Attachment["type"] {
	const ext = filename.split(".").pop()?.toLowerCase() || "";

	const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
	const docExts = ["pdf", "doc", "docx", "txt", "md", "xls", "xlsx", "ppt", "pptx"];
	const codeExts = ["js", "ts", "jsx", "tsx", "json", "html", "css", "py", "java", "cpp"];
	const audioExts = ["mp3", "wav", "flac", "aac", "ogg"];
	const videoExts = ["mp4", "avi", "mov", "wmv", "flv"];
	const archiveExts = ["zip", "rar", "7z", "tar", "gz"];

	if (imageExts.includes(ext)) return "image";
	if (docExts.includes(ext)) return "document";
	if (codeExts.includes(ext)) return "code";
	if (audioExts.includes(ext)) return "audio";
	if (videoExts.includes(ext)) return "video";
	if (archiveExts.includes(ext)) return "archive";
	return "other";
}

// Compact button variant for chat input
interface FileUploadButtonProps {
	onUploadComplete?: (attachments: Attachment[]) => void;
	conversationId?: string;
	messageId?: string;
	className?: string;
}

export function FileUploadButton({
	onUploadComplete,
	conversationId,
	messageId,
	className,
}: FileUploadButtonProps) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = async (files: FileList | null) => {
		if (!files || files.length === 0) return;

		const fileArray = Array.from(files);
		const completedAttachments: Attachment[] = [];

		for (const file of fileArray) {
			try {
				const tempUrl = URL.createObjectURL(file);
				const reader = new FileReader();
				const fileContent = await new Promise<string>((resolve) => {
					reader.onloadend = () => resolve(reader.result as string);
					reader.readAsDataURL(file);
				});

				const ext = file.name.split(".").pop() || "";
				const attachment: Attachment = {
					id: `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
					name: file.name,
					originalName: file.name,
					path: tempUrl,
					size: file.size,
					mimeType: file.type || "application/octet-stream",
					type: getFileType(file.type, ext),
					createdAt: new Date().toISOString(),
					conversationId,
					messageId,
					url: fileContent,
				};

				completedAttachments.push(attachment);
				useAttachmentStore.getState().addAttachment(attachment);
			} catch (error) {
				console.error("Failed to upload file:", error);
			}
		}

		if (completedAttachments.length > 0) {
			onUploadComplete?.(completedAttachments);
		}
	};

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(e) => handleFileSelect(e.target.files)}
			/>
			<Button
				type="text"
				icon={<PaperClipOutlined />}
				onClick={() => fileInputRef.current?.click()}
				className={className}
				title={t("attachment.upload.title", "上传文件", { ns: "attachment" })}
			/>
		</>
	);
}
