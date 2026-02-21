import { app, dialog, ipcMain, shell } from "electron";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	copyFileSync,
} from "fs";
import { join, extname, basename } from "path";
import { FILE_CHANNELS } from "../channels";
import { conversationStorage } from "../../services/chat/ConversationStorageService";

// 附件存储目录 (legacy flat dir, or per-conversation)
function getAttachmentsDir(conversationId?: string): string {
	if (conversationId) {
		return conversationStorage.getAttachmentsDir(conversationId);
	}
	const dir = join(app.getPath("userData"), "attachments");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	return dir;
}

// 生成唯一文件名
function generateUniqueFileName(originalName: string): string {
	const ext = extname(originalName);
	const base = basename(originalName, ext);
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `${base}_${timestamp}_${random}${ext}`;
}

// 获取文件类型
function getFileType(
	mimeType: string,
): "image" | "document" | "code" | "audio" | "video" | "archive" | "other" {
	if (mimeType.startsWith("image/")) return "image";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.startsWith("video/")) return "video";
	if (
		mimeType.includes("pdf") ||
		mimeType.includes("word") ||
		mimeType.includes("excel") ||
		mimeType.includes("text")
	) {
		return "document";
	}
	if (
		mimeType.includes("zip") ||
		mimeType.includes("rar") ||
		mimeType.includes("7z")
	) {
		return "archive";
	}
	if (
		mimeType.includes("javascript") ||
		mimeType.includes("typescript") ||
		mimeType.includes("json") ||
		mimeType.includes("html")
	) {
		return "code";
	}
	return "other";
}

// 支持的图片格式
const IMAGE_EXTENSIONS = [
	".jpg",
	".jpeg",
	".png",
	".gif",
	".webp",
	".bmp",
	".svg",
];

export interface AttachmentInfo {
	id: string;
	name: string;
	originalName: string;
	path: string;
	size: number;
	mimeType: string;
	type: "image" | "document" | "code" | "audio" | "video" | "archive" | "other";
	createdAt: string;
	conversationId?: string;
	messageId?: string;
	thumbnailPath?: string;
}

export function registerFileHandlers() {
	// 选择文件
	ipcMain.handle(
		FILE_CHANNELS.SELECT_FILES,
		async (
			_,
			options?: {
				multiple?: boolean;
				filters?: { name: string; extensions: string[] }[];
			},
		) => {
			const result = await dialog.showOpenDialog({
				properties: options?.multiple
					? ["openFile", "multiSelections"]
					: ["openFile"],
				filters: options?.filters || [
					{ name: "所有文件", extensions: ["*"] },
					{ name: "图片", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
					{ name: "文档", extensions: ["pdf", "doc", "docx", "txt", "md"] },
					{
						name: "代码",
						extensions: ["js", "ts", "json", "html", "css", "py"],
					},
				],
			});

			if (result.canceled || !result.filePaths.length) {
				return { success: false, files: [] };
			}

			const files = result.filePaths.map((path) => {
				const stats = statSync(path);
				const ext = extname(path).toLowerCase();
				let mimeType = "application/octet-stream";

				// 简单的 MIME 类型判断
				if (IMAGE_EXTENSIONS.includes(ext))
					mimeType = `image/${ext.replace(".", "").replace("jpg", "jpeg")}`;
				else if (ext === ".pdf") mimeType = "application/pdf";
				else if (ext === ".txt") mimeType = "text/plain";
				else if (ext === ".md") mimeType = "text/markdown";
				else if (ext === ".json") mimeType = "application/json";
				else if (ext === ".js") mimeType = "application/javascript";
				else if (ext === ".html") mimeType = "text/html";
				else if (ext === ".css") mimeType = "text/css";

				return {
					path,
					name: basename(path),
					size: stats.size,
					mimeType,
				};
			});

			return { success: true, files };
		},
	);

	// 读取文件内容
	ipcMain.handle(
		FILE_CHANNELS.READ_FILE,
		async (
			_,
			filePath: string,
			options?: { encoding?: BufferEncoding; maxSize?: number },
		) => {
			try {
				if (!existsSync(filePath)) {
					return { success: false, error: "文件不存在" };
				}

				const stats = statSync(filePath);
				const maxSize = options?.maxSize || 10 * 1024 * 1024; // 默认 10MB 限制

				if (stats.size > maxSize) {
					return { success: false, error: "文件过大", size: stats.size };
				}

				const encoding = options?.encoding || "utf-8";
				const content = readFileSync(filePath, { encoding });

				return { success: true, content, size: stats.size };
			} catch (error) {
				return { success: false, error: String(error) };
			}
		},
	);

	// 保存附件
	ipcMain.handle(
		FILE_CHANNELS.SAVE_ATTACHMENT,
		async (
			_,
			data: {
				sourcePath: string;
				conversationId?: string;
				messageId?: string;
				customName?: string;
			},
		) => {
			try {
				const { sourcePath, conversationId, messageId, customName } = data;

				if (!existsSync(sourcePath)) {
					return { success: false, error: "源文件不存在" };
				}

				const attachmentsDir = getAttachmentsDir(conversationId);
				const originalName = customName || basename(sourcePath);
				const uniqueName = generateUniqueFileName(originalName);
				const targetPath = join(attachmentsDir, uniqueName);

				// 复制文件
				copyFileSync(sourcePath, targetPath);

				// 获取文件信息
				const stats = statSync(targetPath);
				const ext = extname(originalName).toLowerCase();

				// 推断 MIME 类型
				let mimeType = "application/octet-stream";
				if (IMAGE_EXTENSIONS.includes(ext)) {
					mimeType = `image/${ext.replace(".", "").replace("jpg", "jpeg")}`;
				} else if (ext === ".pdf") mimeType = "application/pdf";
				else if (ext === ".txt") mimeType = "text/plain";
				else if (ext === ".md") mimeType = "text/markdown";

				const attachment: AttachmentInfo = {
					id: uniqueName.replace(extname(uniqueName), ""),
					name: uniqueName,
					originalName,
					path: targetPath,
					size: stats.size,
					mimeType,
					type: getFileType(mimeType),
					createdAt: new Date().toISOString(),
					conversationId,
					messageId,
				};

				return { success: true, attachment };
			} catch (error) {
				return { success: false, error: String(error) };
			}
		},
	);

	// 删除附件
	ipcMain.handle(
		FILE_CHANNELS.DELETE_ATTACHMENT,
		async (_, attachmentPath: string) => {
			try {
				const fs = await import("fs");
				if (existsSync(attachmentPath)) {
					await fs.promises.unlink(attachmentPath);
				}
				return { success: true };
			} catch (error) {
				return { success: false, error: String(error) };
			}
		},
	);

	// 获取附件列表
	ipcMain.handle(
		FILE_CHANNELS.LIST_ATTACHMENTS,
		async (_, filter?: { conversationId?: string }) => {
			try {
				const attachmentsDir = getAttachmentsDir(filter?.conversationId);
				if (!existsSync(attachmentsDir)) {
					return { success: true, attachments: [] };
				}

				const files = readdirSync(attachmentsDir);
				const attachments: AttachmentInfo[] = [];

				for (const file of files) {
					const filePath = join(attachmentsDir, file);
					const stats = statSync(filePath);

					if (stats.isFile()) {
						const ext = extname(file).toLowerCase();
						let mimeType = "application/octet-stream";

						if (IMAGE_EXTENSIONS.includes(ext)) {
							mimeType = `image/${ext.replace(".", "").replace("jpg", "jpeg")}`;
						} else if (ext === ".pdf") mimeType = "application/pdf";
						else if (ext === ".txt") mimeType = "text/plain";

						attachments.push({
							id: file.replace(ext, ""),
							name: file,
							originalName: file,
							path: filePath,
							size: stats.size,
							mimeType,
							type: getFileType(mimeType),
							createdAt: stats.birthtime.toISOString(),
						});
					}
				}

				// 排序：最新的在前
				attachments.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				);

				return { success: true, attachments };
			} catch (error) {
				return { success: false, error: String(error), attachments: [] };
			}
		},
	);

	// 打开附件
	ipcMain.handle(
		FILE_CHANNELS.OPEN_ATTACHMENT,
		async (_, attachmentPath: string) => {
			try {
				if (!existsSync(attachmentPath)) {
					return { success: false, error: "文件不存在" };
				}

				const error = await shell.openPath(attachmentPath);
				if (error) {
					return { success: false, error };
				}

				return { success: true };
			} catch (error) {
				return { success: false, error: String(error) };
			}
		},
	);

	// 获取附件目录路径
	ipcMain.handle(FILE_CHANNELS.GET_ATTACHMENT_PATH, () => {
		return getAttachmentsDir();
	});

	// 复制文件到剪贴板
	ipcMain.handle(FILE_CHANNELS.COPY_FILE, async (_, filePath: string) => {
		try {
			if (!existsSync(filePath)) {
				return { success: false, error: "文件不存在" };
			}

			// 在 Electron 中复制文件需要使用 clipboard 模块
			// 这里我们只返回成功，实际的复制操作在渲染进程处理
			return { success: true };
		} catch (error) {
			return { success: false, error: String(error) };
		}
	});
}
