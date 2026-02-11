/**
 * Iconfont图标下载器 Skill
 *
 * 功能：
 * 1. 登录iconfont.cn
 * 2. 搜索图标
 * 3. 下载SVG到指定目录
 *
 * 注意：此skill需要puppeteer或playwright依赖来处理登录和页面爬取
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// 类型定义
interface LoginCredentials {
	username: string;
	password: string;
}

interface SearchInput {
	keyword: string;
	limit?: number;
	page?: number;
}

interface DownloadInput {
	iconId: string;
	iconName: string;
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
}

interface SkillResult {
	success: boolean;
	output?: unknown;
	error?: string;
}

// 模拟浏览器会话存储
// 实际实现中，应该使用puppeteer/playwright来管理cookie和session
let sessionCookies: string | null = null;
let isLoggedIn = false;

/**
 * 登录iconfont.cn
 *
 * 实现说明：
 * 1. 使用puppeteer或playwright打开iconfont登录页面
 * 2. 输入用户名密码
 * 3. 处理可能的验证码
 * 4. 获取并保存session cookies
 */
async function login(credentials: LoginCredentials): Promise<SkillResult> {
	try {
		console.log(`[Iconfont] 正在登录用户: ${credentials.username}`);

		// TODO: 实现实际的登录逻辑
		// 以下是伪代码示例：
		/*
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // 打开登录页面
    await page.goto('https://www.iconfont.cn/login');

    // 输入登录信息
    await page.type('input[name="username"]', credentials.username);
    await page.type('input[name="password"]', credentials.password);

    // 点击登录按钮
    await page.click('.login-btn');

    // 等待登录完成
    await page.waitForNavigation();

    // 获取cookies
    const cookies = await page.cookies();
    sessionCookies = JSON.stringify(cookies);

    // 检查登录状态
    const userElement = await page.$('.user-info');
    if (!userElement) {
      throw new Error('登录失败，请检查用户名和密码');
    }

    await browser.close();
    */

		// 模拟登录成功（实际实现中删除）
		isLoggedIn = true;
		sessionCookies = "mock_session_token";

		return {
			success: true,
			output: {
				message: "登录成功",
				username: credentials.username,
				loginTime: new Date().toISOString(),
			},
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "登录失败";
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
	// TODO: 实际实现中，应该验证session是否有效
	// 例如：使用保存的cookies访问用户信息页面，检查是否返回登录状态

	return {
		success: true,
		output: {
			isLoggedIn,
			message: isLoggedIn ? "已登录" : "未登录",
		},
	};
}

/**
 * 退出登录
 */
async function logout(): Promise<SkillResult> {
	isLoggedIn = false;
	sessionCookies = null;

	return {
		success: true,
		output: {
			message: "已退出登录",
		},
	};
}

/**
 * 搜索图标
 *
 * 实现说明：
 * 1. 验证登录状态
 * 2. 调用iconfont搜索API或使用puppeteer爬取搜索结果
 * 3. 解析返回的图标数据
 * 4. 返回格式化的图标列表
 */
async function search(input: SearchInput): Promise<SkillResult> {
	try {
		// 检查登录状态
		if (!isLoggedIn) {
			return {
				success: false,
				error:
					"未登录iconfont，请先使用login工具登录。\n使用方法：\n1. 调用login工具\n2. 提供username和password参数",
			};
		}

		const { keyword, limit = 10, page = 1 } = input;
		console.log(`[Iconfont] 搜索图标: ${keyword}, 页码: ${page}, 数量: ${limit}`);

		// TODO: 实现实际的搜索逻辑
		// iconfont搜索API示例（可能需要逆向工程获取真实API）：
		/*
    const searchUrl = `https://www.iconfont.cn/api/icon/search.json`;
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookies || ''
      },
      body: JSON.stringify({
        q: keyword,
        page: page,
        pageSize: limit,
        sortType: 'updated_at', // 或 'usage_count'
        t: Date.now()
      })
    });

    const data = await response.json();

    if (data.code !== 200) {
      throw new Error(data.message || '搜索失败');
    }

    const icons: IconResult[] = data.data.icons.map((icon: any) => ({
      id: icon.id,
      name: icon.name,
      svgUrl: icon.show_svg,
      previewUrl: icon.url,
      author: icon.author_name,
      authorId: icon.author_id
    }));
    */

		// 模拟搜索结果（实际实现中删除）
		const mockIcons: IconResult[] = [
			{
				id: "1234567",
				name: `${keyword}-icon-1`,
				svgUrl: `https://example.com/icon1.svg`,
				author: "设计师A",
				authorId: "user1",
			},
			{
				id: "1234568",
				name: `${keyword}-icon-2`,
				svgUrl: `https://example.com/icon2.svg`,
				author: "设计师B",
				authorId: "user2",
			},
			{
				id: "1234569",
				name: `${keyword}-icon-3`,
				svgUrl: `https://example.com/icon3.svg`,
				author: "设计师C",
				authorId: "user3",
			},
		];

		// 构建展示给用户的结果
		const resultForDisplay = mockIcons.map((icon, index) => ({
			序号: index + 1,
			图标ID: icon.id,
			名称: icon.name,
			作者: icon.author,
			下载链接: icon.svgUrl,
		}));

		return {
			success: true,
			output: {
				total: mockIcons.length,
				keyword,
				page,
				icons: resultForDisplay,
				message: `找到 ${mockIcons.length} 个与"${keyword}"相关的图标`,
				nextStep:
					"请查看上方的图标列表，告诉我你想下载哪个（提供序号或ID），我将为你下载",
			},
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "搜索失败";
		console.error(`[Iconfont] 搜索失败: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * 下载SVG图标
 *
 * 实现说明：
 * 1. 验证登录状态
 * 2. 获取SVG内容（可能需要访问详情页或使用API）
 * 3. 保存到指定目录
 */
async function download(input: DownloadInput): Promise<SkillResult> {
	try {
		// 检查登录状态
		if (!isLoggedIn) {
			return {
				success: false,
				error: "未登录iconfont，请先使用login工具登录",
			};
		}

		const {
			iconId,
			iconName,
			outputPath,
			rename,
		} = input;

		// 确定保存路径
		const defaultOutputPath = path.join(
			process.cwd(),
			"src",
			"renderer",
			"src",
			"components",
			"icons"
		);
		const targetDir = outputPath || defaultOutputPath;
		const fileName = rename || iconName;
		const filePath = path.join(targetDir, `${fileName}.svg`);

		console.log(`[Iconfont] 下载图标: ${iconName} (ID: ${iconId})`);
		console.log(`[Iconfont] 保存路径: ${filePath}`);

		// TODO: 实现实际的下载逻辑
		// 1. 获取SVG URL（可能需要访问图标详情页）
		// 2. 下载SVG内容
		// 3. 保存到文件

		/*
    // 获取图标详情
    const detailUrl = `https://www.iconfont.cn/api/icon/detail.json?id=${iconId}`;
    const detailResponse = await fetch(detailUrl, {
      headers: { 'Cookie': sessionCookies || '' }
    });
    const detailData = await detailResponse.json();

    if (detailData.code !== 200) {
      throw new Error('获取图标详情失败');
    }

    const svgUrl = detailData.data.icon.show_svg;

    // 下载SVG
    const svgResponse = await fetch(svgUrl);
    const svgContent = await svgResponse.text();
    */

		// 模拟SVG内容（实际实现中替换为真实下载）
		const svgContent = `<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="#333"/>
  <path d="M512 336c-44.1 0-80 35.9-80 80s35.9 80 80 80 80-35.9 80-80-35.9-80-80-80zm0 120c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40z" fill="#333"/>
</svg>`;

		// 确保目录存在
		await fs.mkdir(targetDir, { recursive: true });

		// 保存文件
		await fs.writeFile(filePath, svgContent, "utf-8");

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
		const errorMessage =
			error instanceof Error ? error.message : "下载失败";
		console.error(`[Iconfont] 下载失败: ${errorMessage}`);
		return {
			success: false,
			error: errorMessage,
		};
	}
}

/**
 * Skill主入口函数
 *
 * 根据toolName调用对应的处理函数
 */
async function execute(
	toolName: string,
	input: Record<string, unknown>
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
			return search(input as SearchInput);

		case "download":
			return download(input as DownloadInput);

		default:
			return {
				success: false,
				error: `未知的工具: ${toolName}`,
			};
	}
}

// 导出执行函数
export { execute };

// 如果直接运行此文件（用于测试）
if (import.meta.url === fileURLToPath(import.meta.url)) {
	// 测试代码
	console.log("Iconfont Downloader Skill - Test Mode");
}
