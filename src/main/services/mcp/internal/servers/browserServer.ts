/**
 * @mcp/browser — 内置浏览器控制工具
 * 通过隐藏 Electron BrowserWindow 控制浏览器
 */

import { BrowserWindow } from "electron";
import { logger } from "../../../../utils/logger";
import type { InternalMcpServer, InternalToolHandler } from "../types";

const log = logger.withContext("InternalMCP:Browser");

let browserWindow: BrowserWindow | null = null;

function getOrCreateWindow(): BrowserWindow {
	if (browserWindow && !browserWindow.isDestroyed()) {
		return browserWindow;
	}

	log.info("Creating hidden browser window");
	browserWindow = new BrowserWindow({
		show: false,
		width: 1280,
		height: 720,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	browserWindow.on("closed", () => {
		browserWindow = null;
	});

	return browserWindow;
}

function textResult(text: string, isError = false) {
	return { content: [{ type: "text" as const, text }], isError };
}

const browserOpenHandler: InternalToolHandler = async (args) => {
	const url = args.url as string;

	if (!url || typeof url !== "string") {
		return textResult("Error: url is required", true);
	}

	if (url.startsWith("file://")) {
		return textResult("Error: file:// protocol is not allowed", true);
	}

	try {
		const win = getOrCreateWindow();
		await win.loadURL(url);

		const title = win.getTitle();
		const currentUrl = win.webContents.getURL();

		return textResult(
			`Page loaded successfully.\nURL: ${currentUrl}\nTitle: ${title}`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error opening URL: ${msg}`, true);
	}
};

const browserExecuteJsHandler: InternalToolHandler = async (args) => {
	const code = args.code as string;

	if (!code || typeof code !== "string") {
		return textResult("Error: code is required", true);
	}

	if (!browserWindow || browserWindow.isDestroyed()) {
		return textResult(
			"Error: no browser page is open. Use browser_open first.",
			true,
		);
	}

	try {
		const result = await browserWindow.webContents.executeJavaScript(code);
		const resultStr =
			result === undefined ? "undefined" : JSON.stringify(result, null, 2);
		return textResult(resultStr);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`JavaScript execution error: ${msg}`, true);
	}
};

const browserGetContentHandler: InternalToolHandler = async (args) => {
	const format = (args.format as string) || "text";

	if (!browserWindow || browserWindow.isDestroyed()) {
		return textResult(
			"Error: no browser page is open. Use browser_open first.",
			true,
		);
	}

	try {
		let content: string;

		if (format === "html") {
			content = await browserWindow.webContents.executeJavaScript(
				"document.documentElement.outerHTML",
			);
		} else {
			content = await browserWindow.webContents.executeJavaScript(
				"document.body.innerText",
			);
		}

		if (content.length > 200_000) {
			content = content.slice(0, 200_000) + "\n...(truncated)";
		}

		return textResult(content);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error getting page content: ${msg}`, true);
	}
};

const browserScreenshotHandler: InternalToolHandler = async () => {
	if (!browserWindow || browserWindow.isDestroyed()) {
		return textResult(
			"Error: no browser page is open. Use browser_open first.",
			true,
		);
	}

	try {
		const image = await browserWindow.webContents.capturePage();
		const pngBuffer = image.toPNG();
		const base64 = pngBuffer.toString("base64");

		return {
			content: [
				{
					type: "image" as const,
					data: base64,
					mimeType: "image/png",
				},
			],
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return textResult(`Error taking screenshot: ${msg}`, true);
	}
};

const browserResetHandler: InternalToolHandler = async () => {
	if (browserWindow && !browserWindow.isDestroyed()) {
		browserWindow.destroy();
		browserWindow = null;
	}
	return textResult("Browser reset successfully.");
};

export function createBrowserServer(): InternalMcpServer {
	const handlers = new Map<string, InternalToolHandler>();
	handlers.set("browser_open", browserOpenHandler);
	handlers.set("browser_execute_js", browserExecuteJsHandler);
	handlers.set("browser_get_content", browserGetContentHandler);
	handlers.set("browser_screenshot", browserScreenshotHandler);
	handlers.set("browser_reset", browserResetHandler);

	return {
		id: "@mcp/browser",
		name: "@mcp/browser",
		description:
			"Control a headless browser: navigate to URLs, execute JavaScript, get page content, and take screenshots",
		version: "1.0.0",
		tools: [
			{
				name: "browser_open",
				description:
					"Open a URL in the headless browser (creates the browser if needed)",
				inputSchema: {
					type: "object",
					properties: {
						url: { type: "string", description: "The URL to navigate to" },
					},
					required: ["url"],
				},
			},
			{
				name: "browser_execute_js",
				description:
					"Execute JavaScript code in the browser page context and return the result",
				inputSchema: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "JavaScript code to execute in the page context",
						},
					},
					required: ["code"],
				},
			},
			{
				name: "browser_get_content",
				description: "Get the current page content as text or HTML",
				inputSchema: {
					type: "object",
					properties: {
						format: {
							type: "string",
							description:
								"Output format: 'text' for plain text, 'html' for HTML source (default: text)",
							enum: ["text", "html"],
						},
					},
				},
			},
			{
				name: "browser_screenshot",
				description:
					"Take a screenshot of the current browser page (returns base64 PNG image)",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
			{
				name: "browser_reset",
				description: "Close the browser and reset all state",
				inputSchema: {
					type: "object",
					properties: {},
				},
			},
		],
		handlers,
		async cleanup() {
			if (browserWindow && !browserWindow.isDestroyed()) {
				browserWindow.destroy();
				browserWindow = null;
			}
		},
	};
}
