/**
 * @scp/file-system — 内置文件系统操作工具
 * 使用 Node.js fs/promises
 */

import * as fs from "fs/promises";
import * as path from "path";
import { glob } from "tinyglobby";
import type { InternalMcpServer, InternalToolHandler } from "../types";

const BLOCKED_PATHS = [
	"/etc",
	"/System",
	"/Library",
	"/private",
	"/bin",
	"/sbin",
	"/usr/bin",
	"/usr/sbin",
	"C:\\Windows",
	"C:\\Program Files",
	"C:\\Program Files (x86)",
];

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

function isBlockedPath(targetPath: string): boolean {
	const resolved = path.resolve(targetPath);
	return BLOCKED_PATHS.some(
		(blocked) =>
			resolved === blocked || resolved.startsWith(blocked + path.sep),
	);
}

const readFileHandler: InternalToolHandler = async (args) => {
	const filePath = args.path as string;
	const encoding = (args.encoding as BufferEncoding) || "utf-8";

	if (!filePath) return textResult("Error: path is required", true);
	if (isBlockedPath(filePath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		const content = await fs.readFile(filePath, { encoding });
		return textResult(content);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error reading file: ${msg}`, true);
	}
};

const writeFileHandler: InternalToolHandler = async (args) => {
	const filePath = args.path as string;
	const content = args.content as string;

	if (!filePath) return textResult("Error: path is required", true);
	if (content === undefined || content === null)
		return textResult("Error: content is required", true);
	if (isBlockedPath(filePath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		// 确保目录存在
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content, "utf-8");
		return textResult(`File written successfully: ${filePath}`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error writing file: ${msg}`, true);
	}
};

const listDirectoryHandler: InternalToolHandler = async (args) => {
	const dirPath = args.path as string;

	if (!dirPath) return textResult("Error: path is required", true);
	if (isBlockedPath(dirPath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		const items = await Promise.all(
			entries.map(async (entry) => {
				const fullPath = path.join(dirPath, entry.name);
				try {
					const stats = await fs.stat(fullPath);
					return {
						name: entry.name,
						type: entry.isDirectory() ? "directory" : "file",
						size: stats.size,
						modified: stats.mtime.toISOString(),
					};
				} catch {
					return {
						name: entry.name,
						type: entry.isDirectory() ? "directory" : "file",
						size: 0,
						modified: "",
					};
				}
			}),
		);
		return textResult(JSON.stringify(items, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error listing directory: ${msg}`, true);
	}
};

const createDirectoryHandler: InternalToolHandler = async (args) => {
	const dirPath = args.path as string;

	if (!dirPath) return textResult("Error: path is required", true);
	if (isBlockedPath(dirPath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		await fs.mkdir(dirPath, { recursive: true });
		return textResult(`Directory created: ${dirPath}`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error creating directory: ${msg}`, true);
	}
};

const moveFileHandler: InternalToolHandler = async (args) => {
	const source = args.source as string;
	const destination = args.destination as string;

	if (!source || !destination)
		return textResult("Error: source and destination are required", true);
	if (isBlockedPath(source) || isBlockedPath(destination)) {
		return textResult("Error: access to system directory is not allowed", true);
	}

	try {
		await fs.mkdir(path.dirname(destination), { recursive: true });
		await fs.rename(source, destination);
		return textResult(`Moved: ${source} → ${destination}`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error moving file: ${msg}`, true);
	}
};

const fileInfoHandler: InternalToolHandler = async (args) => {
	const filePath = args.path as string;

	if (!filePath) return textResult("Error: path is required", true);
	if (isBlockedPath(filePath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		const stats = await fs.stat(filePath);
		const info = {
			path: path.resolve(filePath),
			type: stats.isDirectory()
				? "directory"
				: stats.isFile()
					? "file"
					: "other",
			size: stats.size,
			created: stats.birthtime.toISOString(),
			modified: stats.mtime.toISOString(),
			accessed: stats.atime.toISOString(),
			permissions: stats.mode.toString(8),
		};
		return textResult(JSON.stringify(info, null, 2));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error getting file info: ${msg}`, true);
	}
};

const searchFilesHandler: InternalToolHandler = async (args) => {
	const dirPath = args.path as string;
	const pattern = args.pattern as string;

	if (!dirPath || !pattern)
		return textResult("Error: path and pattern are required", true);
	if (isBlockedPath(dirPath))
		return textResult("Error: access to system directory is not allowed", true);

	try {
		const files = await glob([pattern], {
			cwd: dirPath,
			absolute: true,
			dot: false,
		});

		if (files.length === 0) {
			return textResult("No files found matching the pattern.");
		}

		const truncated =
			files.length > 1000
				? files.slice(0, 1000).concat([`... and ${files.length - 1000} more`])
				: files;

		return textResult(truncated.join("\n"));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error searching files: ${msg}`, true);
	}
};

export function createFileSystemServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("read_file", readFileHandler);
	handlers.set("write_file", writeFileHandler);
	handlers.set("list_directory", listDirectoryHandler);
	handlers.set("create_directory", createDirectoryHandler);
	handlers.set("move_file", moveFileHandler);
	handlers.set("file_info", fileInfoHandler);
	handlers.set("search_files", searchFilesHandler);

	return {
		id: "@scp/file-system",
		name: "@scp/file-system",
		description:
			"File system operations: read, write, list, move, search files and directories",
		version: "1.0.0",
		tools: [
			{
				name: "read_file",
				description: "Read the contents of a file",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string", description: "Absolute path to the file" },
						encoding: {
							type: "string",
							description: "File encoding (default: utf-8)",
							enum: ["utf-8", "ascii", "base64", "latin1"],
						},
					},
					required: ["path"],
				},
			},
			{
				name: "write_file",
				description:
					"Write content to a file (creates parent directories if needed)",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string", description: "Absolute path to the file" },
						content: { type: "string", description: "Content to write" },
					},
					required: ["path", "content"],
				},
			},
			{
				name: "list_directory",
				description:
					"List the contents of a directory with file type and size info",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Absolute path to the directory",
						},
					},
					required: ["path"],
				},
			},
			{
				name: "create_directory",
				description:
					"Create a directory (recursively creates parent directories)",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Absolute path to the directory",
						},
					},
					required: ["path"],
				},
			},
			{
				name: "move_file",
				description: "Move or rename a file or directory",
				inputSchema: {
					type: "object",
					properties: {
						source: { type: "string", description: "Source path" },
						destination: { type: "string", description: "Destination path" },
					},
					required: ["source", "destination"],
				},
			},
			{
				name: "file_info",
				description:
					"Get detailed information about a file or directory (size, dates, permissions)",
				inputSchema: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Absolute path to the file or directory",
						},
					},
					required: ["path"],
				},
			},
			{
				name: "search_files",
				description: "Search for files matching a glob pattern in a directory",
				inputSchema: {
					type: "object",
					properties: {
						path: { type: "string", description: "Directory to search in" },
						pattern: {
							type: "string",
							description: "Glob pattern (e.g., '**/*.ts', '*.json')",
						},
					},
					required: ["path", "pattern"],
				},
			},
		],
		handlers,
	};
}
