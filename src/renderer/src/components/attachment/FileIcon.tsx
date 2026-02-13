import { useTranslation } from "react-i18next";
import { cn } from "../../lib/utils";
import type { AttachmentType } from "../../stores/attachmentStore";

interface FileIconProps {
	type: AttachmentType;
	extension?: string;
	size?: "sm" | "md" | "lg" | "xl";
	className?: string;
}

const SIZE_MAP = {
	sm: "w-8 h-8",
	md: "w-10 h-10",
	lg: "w-12 h-12",
	xl: "w-16 h-16",
};

const ICON_SIZE_MAP = {
	sm: "w-4 h-4",
	md: "w-5 h-5",
	lg: "w-6 h-6",
	xl: "w-8 h-8",
};

const TYPE_COLORS: Record<AttachmentType, string> = {
	image: "bg-purple-100 text-purple-600",
	document: "bg-blue-100 text-blue-600",
	code: "bg-emerald-100 text-emerald-600",
	audio: "bg-amber-100 text-amber-600",
	video: "bg-rose-100 text-rose-600",
	archive: "bg-slate-100 text-slate-600",
	other: "bg-gray-100 text-gray-600",
};

// SVG icons for each file type
const FileTypeIcons: Record<AttachmentType, React.ReactNode> = {
	image: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="3" y="3" width="18" height="18" rx="2" />
			<circle cx="8.5" cy="8.5" r="1.5" />
			<path d="M21 15l-5-5L5 21" />
		</svg>
	),
	document: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
			<line x1="16" y1="13" x2="8" y2="13" />
			<line x1="16" y1="17" x2="8" y2="17" />
			<line x1="10" y1="9" x2="8" y2="9" />
		</svg>
	),
	code: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<polyline points="16 18 22 12 16 6" />
			<polyline points="8 6 2 12 8 18" />
		</svg>
	),
	audio: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M9 18V5l12-2v13" />
			<circle cx="6" cy="18" r="3" />
			<circle cx="18" cy="16" r="3" />
		</svg>
	),
	video: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<rect x="2" y="2" width="20" height="20" rx="2.18" />
			<polygon points="10 8 16 12 10 16 10 8" />
		</svg>
	),
	archive: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M21 8v13H3V8" />
			<path d="M1 3h22v5H1z" />
			<line x1="10" y1="12" x2="14" y2="12" />
		</svg>
	),
	other: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
			<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
			<polyline points="14 2 14 8 20 8" />
		</svg>
	),
};

export function FileIcon({ type, extension, size = "md", className }: FileIconProps) {
	const { t } = useTranslation();

	return (
		<div
			className={cn(
				"rounded-lg flex items-center justify-center shrink-0",
				SIZE_MAP[size],
				TYPE_COLORS[type],
				className
			)}
			title={t(`attachment.type.${type}`, type)}
		>
			<div className={cn("flex items-center justify-center", ICON_SIZE_MAP[size])}>
				{FileTypeIcons[type]}
			</div>
			{extension && size === "xl" && (
				<span className="absolute bottom-1 right-1 text-[8px] font-bold uppercase">
					{extension.slice(0, 4)}
				</span>
			)}
		</div>
	);
}

// Extension-specific icon mapping
export function getFileTypeFromExtension(ext: string): AttachmentType {
	const extension = ext.toLowerCase().replace(".", "");

	const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tiff"];
	const documentExts = ["pdf", "doc", "docx", "txt", "md", "rtf", "odt", "xls", "xlsx", "ppt", "pptx"];
	const codeExts = ["js", "ts", "jsx", "tsx", "json", "html", "css", "scss", "less", "py", "java", "cpp", "c", "go", "rs", "php", "rb", "swift", "kt", "sql", "xml", "yaml", "yml", "sh", "bash"];
	const audioExts = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma"];
	const videoExts = ["mp4", "avi", "mov", "wmv", "flv", "webm", "mkv", "m4v"];
	const archiveExts = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz"];

	if (imageExts.includes(extension)) return "image";
	if (documentExts.includes(extension)) return "document";
	if (codeExts.includes(extension)) return "code";
	if (audioExts.includes(extension)) return "audio";
	if (videoExts.includes(extension)) return "video";
	if (archiveExts.includes(extension)) return "archive";
	return "other";
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
