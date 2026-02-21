/**
 * Puppeteer 实现示例
 *
 * 此文件展示了如何使用 puppeteer 实现 iconfont 的登录和数据爬取
 * 将此代码整合到 index.ts 中即可实现完整功能
 */

import puppeteer, { type Browser, type Page } from "puppeteer";
import * as fs from "fs/promises";
import * as path from "path";

// 存储浏览器实例和页面
let browser: Browser | null = null;
let page: Page | null = null;

/**
 * 初始化浏览器
 */
async function initBrowser(): Promise<{ browser: Browser; page: Page }> {
	if (!browser) {
		browser = await puppeteer.launch({
			headless: false, // 设置为 false 以便看到登录过程（调试用）
			// headless: 'new', // 生产环境使用无头模式
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	}

	if (!page) {
		page = await browser.newPage();

		// 设置视窗大小
		await page.setViewport({ width: 1280, height: 800 });

		// 设置用户代理
		await page.setUserAgent(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		);
	}

	return { browser, page };
}

/**
 * 使用 Puppeteer 登录 iconfont
 */
export async function loginWithPuppeteer(
	username: string,
	password: string,
): Promise<{ success: boolean; message: string }> {
	try {
		const { page } = await initBrowser();

		console.log("[Puppeteer] 打开登录页面...");

		// 访问 iconfont 首页（自动跳转到登录页）
		await page.goto("https://www.iconfont.cn/login", {
			waitUntil: "networkidle0",
			timeout: 30000,
		});

		// 等待登录表单加载
		await page.waitForSelector(".login-form, .login-box, input[type='text']", {
			timeout: 10000,
		});

		console.log("[Puppeteer] 输入登录信息...");

		// 判断是用户名登录还是手机登录
		// iconfont 通常有两种登录方式，需要根据页面元素判断

		// 尝试输入用户名
		try {
			// 方法1：普通输入框
			await page.type(
				"input[placeholder*='用户名' i], input[placeholder*='账号' i], input[name='username']",
				username,
				{
					delay: 100,
				},
			);
		} catch {
			// 方法2：如果是手机号登录，可能需要切换
			const switchToAccount = await page.$(".switch-login-type, .login-switch");
			if (switchToAccount) {
				await switchToAccount.click();
				await page.waitForTimeout(500);
				await page.type("input[type='text']", username, { delay: 100 });
			}
		}

		// 输入密码
		await page.type(
			"input[type='password'], input[placeholder*='密码' i]",
			password,
			{ delay: 100 },
		);

		console.log("[Puppeteer] 点击登录按钮...");

		// 点击登录按钮
		await Promise.all([
			page.waitForNavigation({ waitUntil: "networkidle0" }),
			page.click(".login-btn, button[type='submit'], .submit-btn"),
		]);

		// 检查是否需要验证码
		const captcha = await page.$(".captcha, .verify-code, .geetest");
		if (captcha) {
			console.log("[Puppeteer] 检测到验证码，请手动完成验证...");

			// 等待用户手动完成验证（最多等待 60 秒）
			await page.waitForFunction(
				() => {
					// 检查登录成功的标志
					return (
						document.querySelector(".user-info, .avatar, .user-name") !== null
					);
				},
				{ timeout: 60000 },
			);
		}

		// 检查登录是否成功
		const userElement = await page.$(
			".user-info, .avatar, .user-name, .user-center",
		);

		if (userElement) {
			// 获取用户名
			const userNameText = await page.evaluate(() => {
				const el = document.querySelector(".user-name, .nickname, .username");
				return el?.textContent?.trim();
			});

			console.log(`[Puppeteer] 登录成功，用户名: ${userNameText}`);

			// 保存 cookies 以便后续使用
			const cookies = await page.cookies();
			await fs.writeFile(
				path.join(process.cwd(), "iconfont-cookies.json"),
				JSON.stringify(cookies, null, 2),
			);

			return {
				success: true,
				message: `登录成功，欢迎 ${userNameText || username}`,
			};
		}

		// 检查错误信息
		const errorText = await page.evaluate(() => {
			const errorEl = document.querySelector(
				".error-msg, .error-message, .tip-error",
			);
			return errorEl?.textContent?.trim();
		});

		if (errorText) {
			return {
				success: false,
				message: `登录失败: ${errorText}`,
			};
		}

		return {
			success: false,
			message: "登录失败，请检查用户名和密码",
		};
	} catch (error) {
		console.error("[Puppeteer] 登录过程出错:", error);
		return {
			success: false,
			message: `登录过程出错: ${error instanceof Error ? error.message : "未知错误"}`,
		};
	}
}

/**
 * 使用 Puppeteer 搜索图标
 */
export async function searchWithPuppeteer(
	keyword: string,
	limit = 10,
): Promise<
	Array<{
		id: string;
		name: string;
		className: string;
		author: string;
		svgContent: string;
	}>
> {
	const { page } = await initBrowser();

	console.log(`[Puppeteer] 搜索图标: ${keyword}`);

	// 构建搜索 URL
	const searchUrl = `https://www.iconfont.cn/search/index?searchType=icon&q=${encodeURIComponent(
		keyword,
	)}&page=1&tag=${encodeURIComponent(keyword)}`;

	await page.goto(searchUrl, { waitUntil: "networkidle0" });

	// 等待搜索结果加载
	await page.waitForSelector(".icon-item, .icon-grid, .search-result", {
		timeout: 10000,
	});

	// 提取图标数据
	const icons = await page.evaluate((maxLimit) => {
		const results: Array<{
			id: string;
			name: string;
			className: string;
			author: string;
			svgContent: string;
		}> = [];

		// 根据实际的 DOM 结构选择器
		const iconElements = document.querySelectorAll(
			".icon-item, .icon-card, .icon",
		);

		iconElements.forEach((el, index) => {
			if (index >= maxLimit) return;

			// 提取图标信息
			const id =
				el.getAttribute("data-id") ||
				el.querySelector("[data-id]")?.getAttribute("data-id") ||
				"";
			const name =
				el.getAttribute("title") ||
				el.querySelector(".icon-name, .name")?.textContent?.trim() ||
				"";
			const className =
				el.getAttribute("class") ||
				el.querySelector("[class*='icon']")?.getAttribute("class") ||
				"";
			const author =
				el.querySelector(".author, .user-name")?.textContent?.trim() || "";
			const svgElement = el.querySelector("svg");
			const svgContent = svgElement ? svgElement.outerHTML : "";

			if (id) {
				results.push({ id, name, className, author, svgContent });
			}
		});

		return results;
	}, limit);

	console.log(`[Puppeteer] 找到 ${icons.length} 个图标`);

	return icons;
}

/**
 * 下载单个图标的 SVG
 */
export async function downloadIconWithPuppeteer(
	iconId: string,
	outputPath: string,
	fileName: string,
): Promise<{ success: boolean; filePath: string; message: string }> {
	const { page } = await initBrowser();

	console.log(`[Puppeteer] 下载图标: ${iconId}`);

	try {
		// 访问图标详情页
		const detailUrl = `https://www.iconfont.cn/api/icon/detail.json?id=${iconId}`;

		// 使用 fetch 获取详情（需要在 page 上下文中执行）
		const iconData = await page.evaluate(async (url) => {
			const response = await fetch(url);
			return response.json();
		}, detailUrl);

		if (iconData.code !== 200) {
			throw new Error(iconData.message || "获取图标详情失败");
		}

		// 获取 SVG URL
		const svgUrl = iconData.data?.icon?.show_svg || iconData.data?.icon?.svg;

		if (!svgUrl) {
			throw new Error("无法获取 SVG 地址");
		}

		// 下载 SVG 内容
		const svgContent = await page.evaluate(async (url) => {
			const response = await fetch(url);
			return response.text();
		}, svgUrl);

		// 确保目录存在
		await fs.mkdir(outputPath, { recursive: true });

		// 保存文件
		const filePath = path.join(outputPath, `${fileName}.svg`);
		await fs.writeFile(filePath, svgContent, "utf-8");

		return {
			success: true,
			filePath,
			message: `图标已保存到 ${filePath}`,
		};
	} catch (error) {
		return {
			success: false,
			filePath: "",
			message: `下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
		};
	}
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<void> {
	if (browser) {
		await browser.close();
		browser = null;
		page = null;
	}
}

/**
 * 获取已登录用户的 cookie
 */
export async function getCookies(): Promise<
	Array<{ name: string; value: string; domain?: string }>
> {
	if (!page) {
		return [];
	}
	return page.cookies();
}

/**
 * 加载已保存的 cookies
 */
export async function loadCookies(): Promise<boolean> {
	try {
		const { page } = await initBrowser();
		const cookiesData = await fs.readFile(
			path.join(process.cwd(), "iconfont-cookies.json"),
			"utf-8",
		);
		const cookies = JSON.parse(cookiesData);

		// 设置 cookies
		for (const cookie of cookies) {
			await page.setCookie(cookie);
		}

		console.log("[Puppeteer] Cookies 已加载");
		return true;
	} catch {
		console.log("[Puppeteer] 没有可用的 cookies");
		return false;
	}
}
