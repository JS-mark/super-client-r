/**
 * @scp/nodejs — 内置 Node.js 执行工具
 * 通过 child_process 调用本机 node 进程，支持完整 Node.js API 和 npm 包
 * 环境类型：local（非沙箱，需用户授权）
 */

import { execFile } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { logger } from "../../../../utils/logger";

const log = logger.withContext("InternalMCP:NodeJS");

const DEFAULT_EXEC_TIMEOUT = 30_000; // 30s 默认超时
const MAX_EXEC_TIMEOUT = 60_000; // 60s 最大超时
const MAX_OUTPUT_SIZE = 512 * 1024; // 512KB 输出上限

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

/**
 * 检测本机 node 是否可用
 */
function findNodeBinary(): Promise<string> {
	return new Promise((resolve, reject) => {
		execFile("node", ["--version"], { timeout: 5_000 }, (error, stdout) => {
			if (error) {
				reject(new Error("Node.js is not installed or not in PATH"));
				return;
			}
			log.debug("Node.js detected", { version: stdout.trim() });
			resolve("node");
		});
	});
}

/**
 * 执行 Node.js 代码
 * 将代码写入临时 .mjs 文件，通过 child_process 执行
 */
const executeNodejsHandler: InternalToolHandler = async (args) => {
	const code = args.code as string;
	const workingDir = (args.workingDir as string) || undefined;
	const timeout = Math.min(
		(args.timeout as number) || DEFAULT_EXEC_TIMEOUT,
		MAX_EXEC_TIMEOUT,
	);

	if (!code || typeof code !== "string") {
		return textResult("Error: code is required", true);
	}

	let tmpDir: string | null = null;

	try {
		const nodeBin = await findNodeBinary();

		// 创建临时目录和文件
		tmpDir = await mkdtemp(join(tmpdir(), "scp-nodejs-"));
		const tmpFile = join(tmpDir, "script.mjs");
		await writeFile(tmpFile, code, "utf-8");

		// 执行
		const result = await new Promise<{ stdout: string; stderr: string }>(
			(resolve, reject) => {
				execFile(
					nodeBin,
					[tmpFile],
					{
						cwd: workingDir,
						timeout,
						maxBuffer: MAX_OUTPUT_SIZE,
						env: { ...process.env, NODE_NO_WARNINGS: "1" },
					},
					(error, stdout, stderr) => {
						if (error) {
							// 超时
							if (error.killed || error.signal === "SIGTERM") {
								reject(new Error(`Execution timed out after ${timeout}ms`));
								return;
							}
							// 非零退出码但有输出 — 正常返回输出 + 错误
							resolve({
								stdout: stdout || "",
								stderr: stderr || error.message || String(error),
							});
							return;
						}
						resolve({ stdout: stdout || "", stderr: stderr || "" });
					},
				);
			},
		);

		const parts: string[] = [];
		if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
		if (result.stderr) parts.push(`stderr:\n${result.stderr}`);

		const hasError = !result.stdout && result.stderr;
		return textResult(
			parts.length > 0 ? parts.join("\n\n") : "(no output)",
			!!hasError,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	} finally {
		// 清理临时文件
		if (tmpDir) {
			rm(tmpDir, { recursive: true, force: true }).catch(() => {});
		}
	}
};

/**
 * 执行已有的 Node.js 文件
 */
const executeNodejsFileHandler: InternalToolHandler = async (args) => {
	const filePath = args.filePath as string;
	const fileArgs = (args.args as string[]) || [];
	const workingDir = (args.workingDir as string) || undefined;
	const timeout = Math.min(
		(args.timeout as number) || DEFAULT_EXEC_TIMEOUT,
		MAX_EXEC_TIMEOUT,
	);

	if (!filePath || typeof filePath !== "string") {
		return textResult("Error: filePath is required", true);
	}

	try {
		const nodeBin = await findNodeBinary();

		const result = await new Promise<{ stdout: string; stderr: string }>(
			(resolve, reject) => {
				execFile(
					nodeBin,
					[filePath, ...fileArgs],
					{
						cwd: workingDir,
						timeout,
						maxBuffer: MAX_OUTPUT_SIZE,
						env: { ...process.env, NODE_NO_WARNINGS: "1" },
					},
					(error, stdout, stderr) => {
						if (error) {
							if (error.killed || error.signal === "SIGTERM") {
								reject(new Error(`Execution timed out after ${timeout}ms`));
								return;
							}
							resolve({
								stdout: stdout || "",
								stderr: stderr || error.message || String(error),
							});
							return;
						}
						resolve({ stdout: stdout || "", stderr: stderr || "" });
					},
				);
			},
		);

		const parts: string[] = [];
		if (result.stdout) parts.push(`stdout:\n${result.stdout}`);
		if (result.stderr) parts.push(`stderr:\n${result.stderr}`);

		const hasError = !result.stdout && result.stderr;
		return textResult(
			parts.length > 0 ? parts.join("\n\n") : "(no output)",
			!!hasError,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

export function createNodejsServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("execute_nodejs", executeNodejsHandler);
	handlers.set("execute_nodejs_file", executeNodejsFileHandler);

	return {
		id: "@scp/nodejs",
		name: "@scp/nodejs",
		description:
			"Execute Node.js code using the local Node.js runtime. Supports full Node.js APIs, npm packages, and file system access. Requires user approval.",
		version: "1.0.0",
		tools: [
			{
				name: "execute_nodejs",
				description:
					"Execute Node.js code using the local Node.js runtime. The code is written to a temporary .mjs file and executed via `node`. Supports full Node.js APIs (fs, path, http, etc.), ES module imports, and npm packages installed in the working directory. Returns stdout and stderr output.",
				inputSchema: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "Node.js code to execute (ES module syntax)",
						},
						workingDir: {
							type: "string",
							description:
								"Working directory for execution. npm packages in this directory's node_modules will be available. Defaults to the conversation workspace directory.",
						},
						timeout: {
							type: "number",
							description:
								"Execution timeout in milliseconds (default: 30000, max: 60000)",
						},
					},
					required: ["code"],
				},
			},
			{
				name: "execute_nodejs_file",
				description:
					"Execute an existing Node.js file using the local Node.js runtime. Supports passing command-line arguments. Returns stdout and stderr output.",
				inputSchema: {
					type: "object",
					properties: {
						filePath: {
							type: "string",
							description: "Absolute path to the .js or .mjs file to execute",
						},
						args: {
							type: "array",
							items: { type: "string" },
							description: "Command-line arguments to pass to the script",
						},
						workingDir: {
							type: "string",
							description:
								"Working directory for execution. Defaults to the file's parent directory.",
						},
						timeout: {
							type: "number",
							description:
								"Execution timeout in milliseconds (default: 30000, max: 60000)",
						},
					},
					required: ["filePath"],
				},
			},
		],
		handlers,
	};
}
