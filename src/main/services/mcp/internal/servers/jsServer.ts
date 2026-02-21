/**
 * @scp/javascript — 内置 JavaScript 执行工具
 * 使用 quickjs-emscripten WASM 运行时，惰性加载
 * 双重隔离：WASM 线性内存 + 独立 QuickJS 引擎
 */

import type { QuickJSWASMModule, QuickJSContext } from "quickjs-emscripten";
import type { InternalMcpServer, InternalToolHandler } from "../types";
import { logger } from "../../../../utils/logger";

const log = logger.withContext("InternalMCP:JavaScript");

const INIT_TIMEOUT = 30_000; // 30s 初始化超时
const DEFAULT_EXEC_TIMEOUT = 5_000; // 5s 默认执行超时
const MAX_EXEC_TIMEOUT = 30_000; // 30s 最大执行超时
const DEFAULT_MEMORY_LIMIT = 10 * 1024 * 1024; // 10MB 默认内存限制
const MAX_MEMORY_LIMIT = 256 * 1024 * 1024; // 256MB 最大内存限制

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

// 惰性加载的 QuickJS WASM 模块
let quickjsModule: QuickJSWASMModule | null = null;
let quickjsLoading: Promise<QuickJSWASMModule> | null = null;

async function getQuickJS(): Promise<QuickJSWASMModule> {
	if (quickjsModule) return quickjsModule;

	if (quickjsLoading) return quickjsLoading;

	quickjsLoading = (async () => {
		log.info("Loading QuickJS WASM runtime...");
		try {
			const { getQuickJS: loadQuickJS } = await import("quickjs-emscripten");
			quickjsModule = await loadQuickJS();
			log.info("QuickJS loaded successfully");
			return quickjsModule;
		} catch (error) {
			log.error(
				"QuickJS loading failed",
				error instanceof Error ? error : new Error(String(error)),
			);
			quickjsLoading = null;
			throw error;
		}
	})();

	// 添加初始化超时
	const timeout = new Promise<never>((_, reject) =>
		setTimeout(
			() => reject(new Error("QuickJS initialization timed out")),
			INIT_TIMEOUT,
		),
	);

	return Promise.race([quickjsLoading, timeout]);
}

const executeJavaScriptHandler: InternalToolHandler = async (args) => {
	const code = args.code as string;
	const timeout = Math.min(
		(args.timeout as number) || DEFAULT_EXEC_TIMEOUT,
		MAX_EXEC_TIMEOUT,
	);
	const memoryLimit = Math.min(
		(args.memoryLimit as number) || DEFAULT_MEMORY_LIMIT,
		MAX_MEMORY_LIMIT,
	);

	if (!code || typeof code !== "string") {
		return textResult("Error: code is required", true);
	}

	try {
		const QuickJS = await getQuickJS();

		const runtime = QuickJS.newRuntime();
		runtime.setMemoryLimit(memoryLimit);
		runtime.setMaxStackSize(1024 * 320); // 320KB 栈大小

		// CPU 中断控制：基于时间的超时
		const deadline = Date.now() + timeout;
		runtime.setInterruptHandler(() => Date.now() > deadline);

		const context = runtime.newContext();
		const logs: Array<{ level: string; args: string[] }> = [];

		try {
			// 注入 console
			injectConsole(context, logs);

			// 执行代码
			const result = context.evalCode(code);

			if (result.error) {
				const error = context.dump(result.error);
				result.error.dispose();

				const parts: string[] = [];
				if (logs.length > 0) {
					parts.push(formatLogs(logs));
				}
				parts.push(`Error: ${formatValue(error)}`);
				return textResult(parts.join("\n\n"), true);
			}

			const value = context.dump(result.value);
			result.value.dispose();

			const parts: string[] = [];
			if (logs.length > 0) {
				parts.push(formatLogs(logs));
			}
			if (value !== undefined) {
				parts.push(`result: ${formatValue(value)}`);
			}

			return textResult(parts.length > 0 ? parts.join("\n\n") : "(no output)");
		} finally {
			context.dispose();
			runtime.dispose();
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg.includes("interrupted")) {
			return textResult(
				`Error: Execution timed out after ${timeout}ms`,
				true,
			);
		}
		return textResult(`Error: ${msg}`, true);
	}
};

const evalExpressionHandler: InternalToolHandler = async (args) => {
	const expression = args.expression as string;

	if (!expression || typeof expression !== "string") {
		return textResult("Error: expression is required", true);
	}

	try {
		const QuickJS = await getQuickJS();

		const result = QuickJS.evalCode(expression, {
			shouldInterrupt: shouldInterruptAfterDeadline(
				Date.now() + DEFAULT_EXEC_TIMEOUT,
			),
			memoryLimitBytes: DEFAULT_MEMORY_LIMIT,
		});

		return textResult(`${formatValue(result)}`);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error: ${msg}`, true);
	}
};

/**
 * 注入 console 对象到沙箱上下文
 */
function injectConsole(
	context: QuickJSContext,
	logs: Array<{ level: string; args: string[] }>,
): void {
	const consoleObj = context.newObject();

	for (const level of ["log", "warn", "error", "info", "debug"] as const) {
		const fn = context.newFunction(level, (...handles) => {
			const nativeArgs = handles.map((h) => {
				const val = context.dump(h);
				return formatValue(val);
			});
			logs.push({ level, args: nativeArgs });
		});
		context.setProp(consoleObj, level, fn);
		fn.dispose();
	}

	context.setProp(context.global, "console", consoleObj);
	consoleObj.dispose();
}

/**
 * 基于截止时间的中断检查器
 */
function shouldInterruptAfterDeadline(deadline: number) {
	return () => Date.now() > deadline;
}

/**
 * 格式化 console 日志
 */
function formatLogs(
	logs: Array<{ level: string; args: string[] }>,
): string {
	return logs
		.map((entry) => {
			const prefix = entry.level === "log" ? "" : `[${entry.level}] `;
			return `${prefix}${entry.args.join(" ")}`;
		})
		.join("\n");
}

/**
 * 格式化输出值
 */
function formatValue(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

export function createJavaScriptServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("execute_javascript", executeJavaScriptHandler);
	handlers.set("eval_expression", evalExpressionHandler);

	return {
		id: "@scp/javascript",
		name: "@scp/javascript",
		description:
			"Execute JavaScript code in a QuickJS WASM sandbox with memory and timeout limits",
		version: "1.0.0",
		tools: [
			{
				name: "execute_javascript",
				description:
					"Execute JavaScript code in a sandboxed QuickJS WASM environment. Supports console.log/warn/error/info/debug. Returns stdout logs and the final expression result. The sandbox has no access to Node.js APIs, file system, or network.",
				inputSchema: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "JavaScript code to execute",
						},
						timeout: {
							type: "number",
							description:
								"Execution timeout in milliseconds (default: 5000, max: 30000)",
						},
						memoryLimit: {
							type: "number",
							description:
								"Memory limit in bytes (default: 10485760 = 10MB, max: 268435456 = 256MB)",
						},
					},
					required: ["code"],
				},
			},
			{
				name: "eval_expression",
				description:
					"Evaluate a single JavaScript expression and return the result. Simpler and faster than execute_javascript for quick calculations.",
				inputSchema: {
					type: "object",
					properties: {
						expression: {
							type: "string",
							description:
								"JavaScript expression to evaluate (e.g., '2 + 2', 'JSON.stringify({a: 1})')",
						},
					},
					required: ["expression"],
				},
			},
		],
		handlers,
		async cleanup() {
			quickjsModule = null;
			quickjsLoading = null;
		},
	};
}
