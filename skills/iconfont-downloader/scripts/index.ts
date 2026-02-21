/**
 * Iconfont图标下载器 Skill
 *
 * 功能：
 * 1. 检测并使用浏览器自动化工具（优先级：MCP > Playwright > Puppeteer）
 * 2. 登录iconfont.cn（支持自动登录和二维码登录）
 * 3. 搜索图标并展示结果
 * 4. 用户选择后下载SVG
 *
 * 依赖：playwright 或 puppeteer（可选，如使用MCP则不需要）
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// ==================== 类型定义 ====================

interface LoginCredentials {
	username?: string;
	password?: string;
	useQRCode?: boolean;
}

interface SearchInput {
	keyword: string;
	limit?: number;
	page?: number;
}

interface DownloadInput {
	iconId: string;
	iconName: string;
	svgUrl?: string;
	outputPath?: string;
	rename?: string;
}

interface IconResult {
	id: string;
	name: string;
	svgUrl: string;
	previewUrl?: string;
	author: string;
	authorId: string;
	viewBox?: string;
	width?: string;
	height?: string;
}

interface SkillResult {
	success: boolean;
	output?: unknown;
	error?: string;
}

interface BrowserTool {
	type: "mcp" | "playwright" | "puppeteer";
	name: string;
	instance?: any;
}

// ==================== 全局状态 ====================

let sessionCookies: string | null = null;
let isLoggedIn = false;
let currentBrowser: BrowserTool | null = null;
let searchResultsCache: Map<string, IconResult[]> = new Map();

// ==================== 浏览器工具检测 ====================

/**
 * 检测可用的浏览器自动化工具
 * 优先级：1. MCP浏览器工具 > 2. Playwright > 3. Puppeteer
 */
async function detectBrowserTool(): Promise<BrowserTool | null> {
	// 1. 首先检测 MCP 浏览器工具
	try {
		// 检查是否可以通过 MCP 调用浏览器工具
		const mcpTools = await listMcpTools();
		if (
			mcpTools.some(
				(tool) =>
					tool.includes("browser") ||
					tool.includes("playwright") ||
					tool.includes("puppeteer"),
			)
		) {
			console.log("[Iconfont] 检测到 MCP 浏览器工具");
			return { type: "mcp", name: "mcp-browser" };
		}
	} catch (e) {
		// MCP 不可用，继续检测其他选项
	}

	// 2. 检测 Playwright
	try {
		const playwright = await import("playwright");
		console.log("[Iconfont] 检测到 Playwright");
		return { type: "playwright", name: "playwright", instance: playwright };
	} catch (e) {
		// Playwright 未安装
	}

	// 3. 检测 Puppeteer
	try {
		const puppeteer = await import("puppeteer" as string);
		console.log("[Iconfont] 检测到 Puppeteer");
		return { type: "puppeteer", name: "puppeteer", instance: puppeteer };
	} catch (e) {
		// Puppeteer 未安装
	}

	return null;
}

/**
 * 列出可用的 MCP 工具（通过全局 MCP 服务）
 */
async function listMcpTools(): Promise<string[]> {
	// 在实际实现中，这应该调用 MCP 服务来列出工具
	// 这里是占位符，实际由 host 应用注入
	if (typeof globalThis !== "undefined" && (globalThis as any).mcp) {
		return (globalThis as any).mcp.listTools();
	}
	return [];
}

/**
 * 调用 MCP 浏览器工具
 */
async function callMcpBrowserTool(
	action: string,
	params: Record<string, unknown>,
): Promise<any> {
	if (typeof globalThis !== "undefined" && (globalThis as any).mcp) {
		return (globalThis as any).mcp.callTool("browser-" + action, params);
	}
	throw new Error("MCP 服务不可用");
}

// ==================== 浏览器操作封装 ====================

class BrowserManager {
	private browser: any = null;
	private page: any = null;
	private tool: BrowserTool;

	constructor(tool: BrowserTool) {
		this.tool = tool;
	}

	/**
	 * 启动浏览器
	 */
	async launch(headless = false): Promise<void> {
		switch (this.tool.type) {
			case "playwright":
				const { chromium } = this.tool.instance;
				this.browser = await chromium.launch({ headless });
				this.page = await this.browser.newPage();
				break;

			case "puppeteer":
				this.browser = await this.tool.instance.launch({
					headless,
					args: ["--no-sandbox", "--disable-setuid-sandbox"],
				});
				this.page = await this.browser.newPage();
				break;

			case "mcp":
				// MCP 模式下不需要手动启动浏览器
				break;
		}
	}

	/**
	 * 访问页面
	 */
	async goto(url: string): Promise<void> {
		switch (this.tool.type) {
			case "playwright":
				await this.page.goto(url, { waitUntil: "networkidle" });
				break;
			case "puppeteer":
				await this.page.goto(url, { waitUntil: "networkidle2" });
				break;
			case "mcp":
				await callMcpBrowserTool("navigate", { url });
				break;
		}
	}

	/**
	 * 等待元素
	 */
	async waitForSelector(selector: string, timeout = 5000): Promise<any> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				return await this.page.waitForSelector(selector, { timeout });
			case "mcp":
				return await callMcpBrowserTool("waitForSelector", {
					selector,
					timeout,
				});
		}
	}

	/**
	 * 点击元素
	 */
	async click(selector: string): Promise<void> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				await this.page.click(selector);
				break;
			case "mcp":
				await callMcpBrowserTool("click", { selector });
				break;
		}
	}

	/**
	 * 输入文本
	 */
	async type(selector: string, text: string): Promise<void> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				await this.page.type(selector, text);
				break;
			case "mcp":
				await callMcpBrowserTool("type", { selector, text });
				break;
		}
	}

	/**
	 * 获取页面内容
	 */
	async content(): Promise<string> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				return await this.page.content();
			case "mcp":
				return await callMcpBrowserTool("getContent", {});
		}
	}

	/**
	 * 执行 JavaScript
	 */
	async evaluate<T, A = unknown>(
		script: string | ((arg: A) => T),
		arg?: A,
	): Promise<T> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				return await this.page.evaluate(script as any, arg);
			case "mcp":
				return await callMcpBrowserTool("evaluate", {
					script: script.toString(),
					arg,
				});
		}
	}

	/**
	 * 获取 Cookies
	 */
	async getCookies(): Promise<any[]> {
		switch (this.tool.type) {
			case "playwright":
				return await this.context.cookies();
			case "puppeteer":
				return await this.page.cookies();
			case "mcp":
				return await callMcpBrowserTool("getCookies", {});
		}
	}

	/**
	 * 截图
	 */
	async screenshot(options?: any): Promise<Buffer | string> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				return await this.page.screenshot(options);
			case "mcp":
				return await callMcpBrowserTool("screenshot", options || {});
		}
	}

	/**
	 * 关闭浏览器
	 */
	async close(): Promise<void> {
		switch (this.tool.type) {
			case "playwright":
			case "puppeteer":
				if (this.browser) {
					await this.browser.close();
				}
				break;
			case "mcp":
				// MCP 模式下不需要手动关闭
				break;
		}
	}

	private get context() {
		return this.page?.context?.() || this.browser?.defaultBrowserContext?.();
	}
}

// ==================== 核心功能实现 ====================

/**
 * 登录 iconfont.cn
 * 支持：1. 账号密码登录 2. 二维码登录
 */
async function login(credentials: LoginCredentials): Promise<SkillResult> {
	try {
		// 检测浏览器工具
		const tool = await detectBrowserTool();
		if (!tool) {
			return {
				success: false,
				error:
					"未检测到浏览器自动化工具。请安装以下任一依赖：\n" +
					"1. playwright: pnpm add playwright\n" +
					"2. puppeteer: pnpm add puppeteer\n" +
					"或者确保 MCP 浏览器工具可用",
			};
		}

		currentBrowser = tool;
		const browser = new BrowserManager(tool);

		// 启动浏览器（非 headless 模式以便用户看到登录过程）
		await browser.launch(false);

		console.log(`[Iconfont] 正在打开登录页面...`);
		await browser.goto("https://www.iconfont.cn/login");

		if (credentials.useQRCode) {
			// 二维码登录
			console.log("[Iconfont] 请使用淘宝/支付宝/微博扫码登录");
			// 等待用户扫码（最多60秒）
			await browser.waitForSelector(".user-info, .user-avatar", 60000);
		} else if (credentials.username && credentials.password) {
			// 账号密码登录
			console.log(`[Iconfont] 正在尝试账号密码登录: ${credentials.username}`);

			// 切换到账号登录标签
			try {
				await browser.click(
					'a[href="#"]:has-text("账号登录"), .login-tab:has-text("账号")',
				);
			} catch (e) {
				// 可能已经在账号登录页
			}

			// 输入账号密码
			await browser.type(
				'input[name="username"], input[placeholder*="用户名"], input[placeholder*="账号"]',
				credentials.username,
			);
			await browser.type(
				'input[name="password"], input[type="password"], input[placeholder*="密码"]',
				credentials.password,
			);

			// 点击登录按钮
			await browser.click(
				'button[type="submit"], .login-btn, button:has-text("登录")',
			);

			// 等待登录完成或出现验证码
			await new Promise((resolve) => setTimeout(resolve, 3000));

			// 检查是否需要处理验证码
			const pageContent = await browser.content();
			if (pageContent.includes("验证码") || pageContent.includes("captcha")) {
				console.log("[Iconfont] 检测到验证码，请在浏览器中手动完成验证");
				// 等待用户完成验证
				await browser.waitForSelector(".user-info, .user-avatar", 60000);
			} else {
				// 等待登录成功标志
				await browser.waitForSelector(".user-info, .user-avatar", 10000);
			}
		} else {
			return {
				success: false,
				error: "请提供账号密码，或设置 useQRCode: true 使用二维码登录",
			};
		}

		// 获取登录后的 cookies
		const cookies = await browser.getCookies();
		sessionCookies = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
		isLoggedIn = true;

		// 获取用户信息
		const userInfo = await browser.evaluate(() => {
			const userNameEl = document.querySelector(
				".user-name, .username, .user-info .name",
			);
			return {
				username: userNameEl?.textContent?.trim() || "未知用户",
			};
		});

		console.log(`[Iconfont] 登录成功: ${userInfo.username}`);

		return {
			success: true,
			output: {
				message: "登录成功",
				username: userInfo.username,
				loginTime: new Date().toISOString(),
				browserTool: tool.name,
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "登录失败";
		console.error(`[Iconfont] 登录失败: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * 检查登录状态
 */
async function checkLoginStatus(): Promise<SkillResult> {
	if (!isLoggedIn || !sessionCookies) {
		return {
			success: true,
			output: {
				isLoggedIn: false,
				message: "未登录",
			},
		};
	}

	try {
		// 验证 cookie 是否仍然有效
		const response = await fetch("https://www.iconfont.cn/api/user/info.json", {
			headers: {
				Cookie: sessionCookies,
				Accept: "application/json",
			},
		});

		const data = await response.json();
		const stillLoggedIn = data.code === 200 && data.data;

		if (!stillLoggedIn) {
			isLoggedIn = false;
			sessionCookies = null;
		}

		return {
			success: true,
			output: {
				isLoggedIn: stillLoggedIn,
				message: stillLoggedIn
					? `已登录: ${data.data.nickName || data.data.userName}`
					: "登录已过期",
			},
		};
	} catch (error) {
		return {
			success: true,
			output: {
				isLoggedIn: false,
				message: "检查登录状态时出错",
			},
		};
	}
}

/**
 * 退出登录
 */
async function logout(): Promise<SkillResult> {
	isLoggedIn = false;
	sessionCookies = null;
	searchResultsCache.clear();

	return {
		success: true,
		output: {
			message: "已退出登录",
		},
	};
}

/**
 * 搜索图标
 * 优先使用 API，失败时回退到页面爬取
 */
async function search(input: SearchInput): Promise<SkillResult> {
	try {
		if (!isLoggedIn) {
			return {
				success: false,
				error:
					"未登录iconfont。请先调用 login 工具进行登录：\n" +
					'方式1 - 账号登录: { "username": "你的账号", "password": "你的密码" }\n' +
					'方式2 - 二维码登录: { "useQRCode": true }',
			};
		}

		const { keyword, limit = 10, page = 1 } = input;
		console.log(
			`[Iconfont] 搜索图标: "${keyword}", 页码: ${page}, 数量: ${limit}`,
		);

		let icons: IconResult[] = [];

		// 尝试使用 API 搜索
		try {
			icons = await searchByAPI(keyword, limit, page);
		} catch (apiError) {
			console.log("[Iconfont] API 搜索失败，尝试页面爬取...");
			icons = await searchByScraping(keyword, limit, page);
		}

		if (icons.length === 0) {
			return {
				success: true,
				output: {
					total: 0,
					keyword,
					icons: [],
					message:
						`未找到与 "${keyword}" 相关的图标，建议：\n` +
						'1. 尝试使用英文关键词（如 "home" 替代 "首页"）\n' +
						'2. 简化关键词（如 "user" 替代 "用户头像"）\n' +
						"3. 检查登录状态是否正常",
				},
			};
		}

		// 缓存搜索结果
		const cacheKey = `${keyword}_${page}`;
		searchResultsCache.set(cacheKey, icons);

		// 格式化展示结果
		const displayResults = icons.map((icon, index) => ({
			序号: index + 1,
			图标ID: icon.id,
			名称: icon.name,
			作者: icon.author,
			预览:
				icon.previewUrl ||
				"https://www.iconfont.cn/search/index?searchType=icon&q=" +
					encodeURIComponent(keyword),
		}));

		return {
			success: true,
			output: {
				total: icons.length,
				keyword,
				page,
				icons: displayResults,
				message: `找到 ${icons.length} 个与 "${keyword}" 相关的图标`,
				instructions:
					"请查看上方图标列表，告诉我你想下载哪个：\n" +
					'• 按序号选择："下载第1个" 或 "下载1,2,3"\n' +
					'• 按ID选择："下载ID:1234567"\n' +
					'• 按名称选择："下载名称为xxx的图标"\n' +
					'• 批量下载："下载全部" 或 "下载前5个"',
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "搜索失败";
		console.error(`[Iconfont] 搜索失败: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * 使用 API 搜索图标
 */
async function searchByAPI(
	keyword: string,
	limit: number,
	page: number,
): Promise<IconResult[]> {
	const searchUrl = "https://www.iconfont.cn/api/icon/search.json";
	const response = await fetch(searchUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Cookie: sessionCookies || "",
			"X-Requested-With": "XMLHttpRequest",
		},
		body: new URLSearchParams({
			q: keyword,
			page: page.toString(),
			pageSize: limit.toString(),
			sortType: "updated_at",
			t: Date.now().toString(),
		}),
	});

	const data = await response.json();

	if (data.code !== 200) {
		throw new Error(data.message || "搜索API返回错误");
	}

	return (data.data?.icons || []).map((icon: any) => ({
		id: icon.id?.toString(),
		name: icon.name,
		svgUrl: icon.show_svg || icon.svg,
		previewUrl: icon.url,
		author: icon.author_name || icon.author,
		authorId: icon.author_id?.toString(),
		viewBox: icon.viewBox,
		width: icon.width,
		height: icon.height,
	}));
}

/**
 * 使用页面爬取搜索图标（API 失败时的备用方案）
 */
async function searchByScraping(
	keyword: string,
	limit: number,
	page: number,
): Promise<IconResult[]> {
	if (!currentBrowser) {
		throw new Error("浏览器工具不可用");
	}

	const browser = new BrowserManager(currentBrowser);
	await browser.launch(true); // headless 模式

	try {
		const searchUrl = `https://www.iconfont.cn/search/index?searchType=icon&q=${encodeURIComponent(keyword)}&page=${page}`;
		await browser.goto(searchUrl);

		// 等待搜索结果加载
		await browser.waitForSelector(
			".icon-item, .icon-list .item, [data-id]",
			10000,
		);

		// 提取图标信息
		const icons = await browser.evaluate((maxResults: number) => {
			const items = document.querySelectorAll(
				".icon-item, .icon-list .item, [data-id]",
			);
			const results: IconResult[] = [];

			items.forEach((item, index) => {
				if (index >= maxResults) return;

				const id =
					item.getAttribute("data-id") ||
					item.querySelector("[data-id]")?.getAttribute("data-id") ||
					"";

				const nameEl = item.querySelector(".name, .icon-name, .title, h3, h4");
				const name = nameEl?.textContent?.trim() || "未命名";

				const authorEl = item.querySelector(".author, .author-name, .user");
				const author = authorEl?.textContent?.trim() || "未知";

				const svgEl = item.querySelector("svg, img");
				const previewUrl =
					svgEl?.getAttribute("src") || svgEl?.getAttribute("data-src") || "";

				results.push({
					id,
					name,
					svgUrl: "", // 需要在详情页获取
					previewUrl,
					author,
					authorId: "",
				});
			});

			return results;
		}, limit);

		return icons;
	} finally {
		await browser.close();
	}
}

/**
 * 下载SVG图标
 */
async function download(input: DownloadInput): Promise<SkillResult> {
	try {
		if (!isLoggedIn) {
			return {
				success: false,
				error: "未登录iconfont，请先使用login工具登录",
			};
		}

		const { iconId, iconName, svgUrl, outputPath, rename } = input;

		// 确定保存路径
		const defaultOutputPath = path.join(
			process.cwd(),
			"src",
			"renderer",
			"src",
			"components",
			"icons",
		);
		const targetDir = outputPath || defaultOutputPath;
		const fileName = rename || sanitizeFileName(iconName);
		const filePath = path.join(targetDir, `${fileName}.svg`);

		console.log(`[Iconfont] 下载图标: ${iconName} (ID: ${iconId})`);

		// 获取 SVG 内容
		let svgContent: string;

		if (svgUrl) {
			// 直接下载提供的 URL
			svgContent = await downloadSVG(svgUrl);
		} else {
			// 从图标详情页获取 SVG
			svgContent = await fetchSVGFromDetailPage(iconId);
		}

		// 确保目录存在
		await fs.mkdir(targetDir, { recursive: true });

		// 保存文件
		await fs.writeFile(filePath, svgContent, "utf-8");

		console.log(`[Iconfont] 图标已保存: ${filePath}`);

		return {
			success: true,
			output: {
				message: "图标下载成功",
				iconId,
				iconName,
				filePath,
				fileSize: svgContent.length,
			},
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "下载失败";
		console.error(`[Iconfont] 下载失败: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * 批量下载图标
 */
async function downloadBatch(input: {
	selections: string;
	keyword?: string;
	outputPath?: string;
}): Promise<SkillResult> {
	try {
		const { selections, keyword, outputPath } = input;

		if (!keyword) {
			return {
				success: false,
				error: "请提供 keyword 参数以确定搜索缓存",
			};
		}

		// 解析用户的选择
		const selectedIcons = parseUserSelection(selections, keyword);

		if (selectedIcons.length === 0) {
			return {
				success: false,
				error:
					"无法解析您的选择，请使用以下格式之一：\n" +
					'• "1,2,3" - 下载第1、2、3个\n' +
					'• "1-5" - 下载第1到5个\n' +
					'• "all" - 下载全部',
			};
		}

		console.log(`[Iconfont] 批量下载 ${selectedIcons.length} 个图标`);

		const results = [];
		const errors = [];

		for (const icon of selectedIcons) {
			const result = await download({
				iconId: icon.id,
				iconName: icon.name,
				svgUrl: icon.svgUrl,
				outputPath,
				rename: sanitizeFileName(icon.name),
			});

			if (result.success) {
				results.push(result.output);
			} else {
				errors.push({ icon: icon.name, error: result.error });
			}
		}

		return {
			success: errors.length === 0,
			output: {
				total: selectedIcons.length,
				success: results.length,
				failed: errors.length,
				downloaded: results,
				errors: errors.length > 0 ? errors : undefined,
				message: `下载完成: ${results.length} 成功, ${errors.length} 失败`,
			},
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "批量下载失败";
		return {
			success: false,
			error: errorMessage,
		};
	}
}

// ==================== 辅助函数 ====================

/**
 * 下载 SVG 内容
 */
async function downloadSVG(url: string): Promise<string> {
	const response = await fetch(url, {
		headers: {
			Cookie: sessionCookies || "",
			Accept:
				"image/svg+xml,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		},
	});

	if (!response.ok) {
		throw new Error(`下载失败: HTTP ${response.status}`);
	}

	return await response.text();
}

/**
 * 从详情页获取 SVG
 */
async function fetchSVGFromDetailPage(iconId: string): Promise<string> {
	// 尝试使用 API 获取
	const detailUrl = `https://www.iconfont.cn/api/icon/detail.json?id=${iconId}`;
	const response = await fetch(detailUrl, {
		headers: {
			Cookie: sessionCookies || "",
			Accept: "application/json",
		},
	});

	const data = await response.json();

	if (data.code === 200 && data.data?.icon?.show_svg) {
		// 下载 SVG 文件
		return await downloadSVG(data.data.icon.show_svg);
	}

	// API 失败，尝试页面爬取
	if (!currentBrowser) {
		throw new Error("无法获取 SVG 下载链接");
	}

	const browser = new BrowserManager(currentBrowser);
	await browser.launch(true);

	try {
		const detailPageUrl = `https://www.iconfont.cn/search/index?searchType=icon&q=${iconId}`;
		await browser.goto(detailPageUrl);

		// 等待 SVG 加载
		await browser.waitForSelector("svg, .icon-svg, [data-icon]", 10000);

		// 提取 SVG 内容
		const svgContent = await browser.evaluate(() => {
			const svgEl = document.querySelector(
				"svg, .icon-svg svg, [data-icon] svg",
			);
			if (svgEl) {
				return svgEl.outerHTML;
			}
			return "";
		});

		if (!svgContent) {
			throw new Error("无法从页面提取 SVG");
		}

		return svgContent;
	} finally {
		await browser.close();
	}
}

/**
 * 解析用户的选择
 */
function parseUserSelection(selections: string, keyword: string): IconResult[] {
	const cacheKeyPrefix = `${keyword}_`;
	let allIcons: IconResult[] = [];

	// 从缓存中获取所有该关键词的搜索结果
	for (const [key, value] of searchResultsCache.entries()) {
		if (key.startsWith(cacheKeyPrefix)) {
			allIcons = allIcons.concat(value);
		}
	}

	if (allIcons.length === 0) {
		return [];
	}

	const selected: IconResult[] = [];
	const trimmed = selections.trim().toLowerCase();

	// "all" 或 "全部"
	if (trimmed === "all" || trimmed === "全部") {
		return allIcons;
	}

	// "前N个" 或 "前N"
	const frontMatch = trimmed.match(/前?(\d+)个?/);
	if (frontMatch) {
		const count = parseInt(frontMatch[1], 10);
		return allIcons.slice(0, count);
	}

	// 解析逗号分隔的序号 (如 "1,2,3" 或 "第1个,第2个")
	const indices = trimmed
		.split(/[,，]/)
		.map((s) => {
			// 提取数字
			const match = s.match(/\d+/);
			return match ? parseInt(match[0], 10) - 1 : -1;
		})
		.filter((i) => i >= 0 && i < allIcons.length);

	// 解析范围 (如 "1-5")
	const rangeMatch = trimmed.match(/(\d+)\s*[-~]\s*(\d+)/);
	if (rangeMatch) {
		const start = parseInt(rangeMatch[1], 10) - 1;
		const end = parseInt(rangeMatch[2], 10);
		for (let i = start; i < end && i < allIcons.length; i++) {
			if (i >= 0) indices.push(i);
		}
	}

	// 去重并获取对应的图标
	const uniqueIndices = [...new Set(indices)];
	for (const idx of uniqueIndices) {
		if (allIcons[idx]) {
			selected.push(allIcons[idx]);
		}
	}

	return selected;
}

/**
 * 清理文件名
 */
function sanitizeFileName(name: string): string {
	return (
		name
			.replace(/[<>:"/\\|?*]/g, "_") // 替换非法字符
			.replace(/\s+/g, "_") // 空格替换为下划线
			.replace(/^_+|_+$/g, "") // 去除首尾下划线
			.replace(/_+/g, "_") || // 多个下划线合并
		"icon"
	); // 默认名称
}

// ==================== Skill 主入口 ====================

async function execute(
	toolName: string,
	input: Record<string, unknown>,
): Promise<SkillResult> {
	console.log(`[Iconfont] 执行工具: ${toolName}`);
	console.log(`[Iconfont] 输入参数:`, JSON.stringify(input, null, 2));

	switch (toolName) {
		case "login":
			return login(input as LoginCredentials);

		case "checkLoginStatus":
			return checkLoginStatus();

		case "logout":
			return logout();

		case "search":
			return search(input as unknown as SearchInput);

		case "download":
			return download(input as unknown as DownloadInput);

		case "downloadBatch":
			return downloadBatch(
				input as { selections: string; keyword?: string; outputPath?: string },
			);

		default:
			return {
				success: false,
				error: `未知的工具: ${toolName}`,
			};
	}
}

export { execute };

// 测试模式
if (import.meta.url === fileURLToPath(import.meta.url)) {
	console.log("Iconfont Downloader Skill - Test Mode");
}
