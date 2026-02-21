/**
 * @scp/python — 内置 Python 执行工具
 * 使用 Pyodide WASM 运行时，惰性加载
 */

import { app } from "electron";
import { join } from "path";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { logger } from "../../../../utils/logger";

const log = logger.withContext("InternalMCP:Python");

const INIT_TIMEOUT = 60_000; // 60s 初始化超时
const EXEC_TIMEOUT = 30_000; // 30s 执行超时

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

// 惰性加载的 Pyodide 实例
let pyodideInstance: any = null;
let pyodideLoading: Promise<any> | null = null;

async function getPyodide(): Promise<any> {
	if (pyodideInstance) return pyodideInstance;

	if (pyodideLoading) return pyodideLoading;

	pyodideLoading = (async () => {
		log.info("Loading Pyodide WASM runtime...");
		try {
			const { loadPyodide } = await import("pyodide");
			// Pyodide WASM 文件在 node_modules/pyodide/ 或打包后的 resources/pyodide/
			const indexURL = app.isPackaged
				? join(process.resourcesPath, "pyodide") + "/"
				: join(app.getAppPath(), "node_modules", "pyodide") + "/";
			log.info("Pyodide indexURL", { indexURL });
			pyodideInstance = await loadPyodide({ indexURL });
			log.info("Pyodide loaded successfully");
			return pyodideInstance;
		} catch (error) {
			log.error(
				"Pyodide loading failed",
				error instanceof Error ? error : new Error(String(error)),
			);
			pyodideLoading = null;
			throw error;
		}
	})();

	// 添加初始化超时
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(
			() => reject(new Error("Pyodide initialization timed out")),
			INIT_TIMEOUT,
		),
	);

	return Promise.race([pyodideLoading, timeout]);
}

const executePythonHandler: InternalToolHandler = async (args) => {
	const code = args.code as string;
	const timeout = Math.min((args.timeout as number) || EXEC_TIMEOUT, 60_000);

	if (!code || typeof code !== "string") {
		return textResult("Error: code is required", true);
	}

	try {
		const pyodide = await getPyodide();

		// 重定向 stdout/stderr
		pyodide.runPython(`
import sys
from io import StringIO
_scp_stdout = StringIO()
_scp_stderr = StringIO()
sys.stdout = _scp_stdout
sys.stderr = _scp_stderr
`);

		// 执行用户代码（带超时）
		let result: any;
		const execPromise = (async () => {
			result = await pyodide.runPythonAsync(code);
		})();

		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`Execution timed out after ${timeout}ms`)),
				timeout,
			),
		);

		await Promise.race([execPromise, timeoutPromise]);

		// 获取输出
		const stdout = pyodide.runPython("_scp_stdout.getvalue()");
		const stderr = pyodide.runPython("_scp_stderr.getvalue()");

		// 恢复 stdout/stderr
		pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);

		const parts: string[] = [];
		if (stdout) parts.push(`stdout:\n${stdout}`);
		if (stderr) parts.push(`stderr:\n${stderr}`);
		if (result !== undefined && result !== null) {
			const resultStr = typeof result === "string" ? result : String(result);
			if (resultStr !== "None") {
				parts.push(`result: ${resultStr}`);
			}
		}

		return textResult(parts.length > 0 ? parts.join("\n\n") : "(no output)");
	} catch (error) {
		// Try to recover stderr from the redirected buffer for full traceback
		const parts: string[] = [];
		try {
			const pyodide = await getPyodide();
			const stderr = pyodide.runPython(
				"_scp_stderr.getvalue() if '_scp_stderr' in dir() else ''",
			);
			const stdout = pyodide.runPython(
				"_scp_stdout.getvalue() if '_scp_stdout' in dir() else ''",
			);
			// Restore stdout/stderr to avoid broken state
			pyodide.runPython(`
import sys
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);
			if (stdout) parts.push(`stdout:\n${stdout}`);
			if (stderr) parts.push(`stderr:\n${stderr}`);
		} catch {
			// Pyodide may not be available if init failed — ignore
		}
		const msg = error instanceof Error ? error.message : String(error);
		parts.push(`Error: ${msg}`);
		return textResult(parts.join("\n\n"), true);
	}
};

const installPackageHandler: InternalToolHandler = async (args) => {
	const packageName = args.package as string;

	if (!packageName || typeof packageName !== "string") {
		return textResult("Error: package name is required", true);
	}

	try {
		const pyodide = await getPyodide();
		await pyodide
			.loadPackagesFromImports(`import ${packageName}`)
			.catch(async () => {
				// 尝试 micropip 安装
				await pyodide.runPythonAsync(`
import micropip
await micropip.install("${packageName.replace(/"/g, '\\"')}")
`);
			});

		return textResult(`Package "${packageName}" installed successfully`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(
			`Failed to install package "${packageName}": ${msg}`,
			true,
		);
	}
};

export function createPythonServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("execute_python", executePythonHandler);
	handlers.set("install_package", installPackageHandler);

	return {
		id: "@scp/python",
		name: "@scp/python",
		description:
			"Execute Python code in a Pyodide WASM sandbox with package installation support",
		version: "1.0.0",
		tools: [
			{
				name: "execute_python",
				description:
					"Execute Python code and return stdout, stderr, and the result. The Python runtime runs in a WASM sandbox with access to many scientific packages.",
				inputSchema: {
					type: "object",
					properties: {
						code: { type: "string", description: "Python code to execute" },
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
				name: "install_package",
				description:
					"Install a Python package using micropip (for pure Python packages available on PyPI)",
				inputSchema: {
					type: "object",
					properties: {
						package: {
							type: "string",
							description:
								"Package name to install (e.g., 'requests', 'pandas')",
						},
					},
					required: ["package"],
				},
			},
		],
		handlers,
		async cleanup() {
			pyodideInstance = null;
			pyodideLoading = null;
		},
	};
}
