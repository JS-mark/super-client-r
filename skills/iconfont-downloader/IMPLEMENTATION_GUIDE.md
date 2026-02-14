# Iconfont Downloader Skill - 实现指南 v2.0

## 架构概述

本 Skill 采用分层架构设计，支持多种浏览器自动化方式，优先级为：**MCP > Playwright > Puppeteer**

```
┌─────────────────────────────────────────────────────────┐
│                    Skill 入口 (execute)                  │
├─────────────────────────────────────────────────────────┤
│  工具层: login | search | download | downloadBatch ...  │
├─────────────────────────────────────────────────────────┤
│  浏览器抽象层: BrowserManager                            │
│  ┌──────────────┬─────────────────┬──────────────────┐ │
│  │   MCP Mode   │ Playwright Mode │  Puppeteer Mode  │ │
│  └──────────────┴─────────────────┴──────────────────┘ │
├─────────────────────────────────────────────────────────┤
│  检测层: detectBrowserTool()                             │
│  按优先级自动选择可用的浏览器工具                         │
└─────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 浏览器工具检测 (detectBrowserTool)

```typescript
async function detectBrowserTool(): Promise<BrowserTool | null>
```

检测优先级：
1. **MCP 浏览器工具** - 检查 `globalThis.mcp` 是否存在浏览器相关工具
2. **Playwright** - 尝试动态导入 `playwright`
3. **Puppeteer** - 尝试动态导入 `puppeteer`

如果都没有检测到，返回错误提示用户安装依赖。

### 2. 浏览器管理器 (BrowserManager)

统一的浏览器操作抽象类，封装了不同工具的 API 差异：

```typescript
class BrowserManager {
  async launch(headless?: boolean): Promise<void>
  async goto(url: string): Promise<void>
  async waitForSelector(selector: string, timeout?: number): Promise<any>
  async click(selector: string): Promise<void>
  async type(selector: string, text: string): Promise<void>
  async content(): Promise<string>
  async evaluate<T>(script: string | (() => T)): Promise<T>
  async getCookies(): Promise<any[]>
  async screenshot(options?: any): Promise<Buffer | string>
  async close(): Promise<void>
}
```

### 3. 登录模块 (login)

支持两种登录方式：

**账号密码登录：**
- 打开登录页面
- 自动填充用户名密码
- 检测验证码（如有则提示用户手动处理）
- 等待登录成功标志

**二维码登录：**
- 打开登录页面
- 显示二维码
- 等待用户扫码（最多60秒）

### 4. 搜索模块 (search)

双模式搜索：

**API 模式（优先）：**
- 使用 iconfont 搜索 API: `/api/icon/search.json`
- 需要有效的 session cookies
- 返回结构化数据

**爬取模式（备用）：**
- 使用浏览器访问搜索页面
- 提取页面中的图标信息
- 适用于 API 被限制的情况

搜索结果会缓存到 `searchResultsCache`，供批量下载使用。

### 5. 下载模块 (download/downloadBatch)

**单个下载：**
- 通过图标 ID 获取 SVG
- 支持直接下载 URL 或从详情页提取
- 保存到指定目录

**批量下载：**
- 解析用户选择字符串
- 从缓存中获取图标信息
- 循环调用单个下载

## 选择解析逻辑

`parseUserSelection` 函数支持多种选择格式：

```typescript
// 格式示例
"1,2,3"      // 下载第 1, 2, 3 个
"1-5"        // 下载第 1 到 5 个
"前5个"       // 下载前 5 个
"all"        // 下载全部
"全部"        // 下载全部（中文）
```

## 状态管理

### 全局状态

```typescript
let sessionCookies: string | null = null;     // 登录 session
let isLoggedIn = false;                        // 登录状态
let currentBrowser: BrowserTool | null = null; // 当前使用的浏览器工具
let searchResultsCache: Map<string, IconResult[]> = new Map(); // 搜索结果缓存
```

### 缓存键格式

```typescript
const cacheKey = `${keyword}_${page}`;  // 例如: "home_1"
```

## 错误处理

### 常见错误及处理

| 错误类型 | 处理方式 |
|---------|---------|
| 未检测到浏览器工具 | 提示安装 playwright 或 puppeteer |
| 未登录 | 提示先调用 login 工具 |
| 登录过期 | 自动清除状态，提示重新登录 |
| 搜索无结果 | 建议更换关键词或检查登录状态 |
| 下载失败 | 检查权限、磁盘空间、网络连接 |

### 错误返回格式

```typescript
{
  success: false,
  error: "详细的错误信息，包含解决建议"
}
```

## MCP 集成

### MCP 工具接口约定

如果 host 应用提供 MCP 浏览器工具，需要实现以下接口：

```typescript
// 列出可用工具
mcp.listTools(): string[]

// 调用浏览器工具
mcp.callTool('browser-navigate', { url: string }): Promise<void>
mcp.callTool('browser-click', { selector: string }): Promise<void>
mcp.callTool('browser-type', { selector: string, text: string }): Promise<void>
mcp.callTool('browser-waitForSelector', { selector: string, timeout?: number }): Promise<void>
mcp.callTool('browser-getContent', {}): Promise<string>
mcp.callTool('browser-evaluate', { script: string }): Promise<any>
mcp.callTool('browser-getCookies', {}): Promise<any[]>
mcp.callTool('browser-screenshot', {}): Promise<Buffer | string>
```

### Host 应用注入方式

```typescript
// 在 Skill 执行前，host 应用需要将 MCP 服务注入 globalThis
globalThis.mcp = {
  listTools: () => ['browser-navigate', 'browser-click', ...],
  callTool: (name, params) => { ... }
};
```

## 开发调试

### 本地测试

```bash
cd skills/iconfont-downloader/scripts

# 编译 TypeScript
npm run build

# 运行测试
npm test
```

### 调试模式

在 `login` 函数中设置 `headless: false` 可以看到浏览器窗口，便于调试：

```typescript
await browser.launch(false); // 非 headless 模式
```

### 日志输出

使用 `console.log` 输出调试信息，格式统一为：

```typescript
console.log(`[Iconfont] 操作描述: ${变量}`);
```

## 安全注意事项

1. **Cookie 安全**
   - Session cookies 仅保存在内存中
   - 不提供持久化存储
   - 进程结束后自动清除

2. **密码安全**
   - 密码仅用于登录过程
   - 不存储到任何位置
   - 登录完成后立即丢弃

3. **路径安全**
   - 使用 `sanitizeFileName` 清理文件名
   - 防止路径遍历攻击

## 性能优化

1. **搜索缓存**
   - 同一关键词的搜索结果缓存复用
   - 减少重复请求

2. **API 优先**
   - 优先使用 API 获取数据
   - 比页面爬取更快更稳定

3. **按需启动浏览器**
   - 仅在需要时启动浏览器实例
   - 操作完成后及时关闭

## 扩展建议

### 可能的增强功能

1. **图标预览**
   - 在搜索结果中返回 base64 编码的预览图
   - 或返回预览 URL

2. **图标库搜索**
   - 支持搜索图标库（iconfont projects）
   - 批量下载整个图标库

3. **格式转换**
   - 支持下载 PNG 格式
   - 支持指定颜色下载

4. **历史记录**
   - 记录下载历史
   - 支持重复下载

5. **智能推荐**
   - 根据关键词推荐相似图标
   - 根据下载历史推荐

## 更新记录

### v2.0.0
- 新增 BrowserManager 抽象层
- 支持 MCP/Playwright/Puppeteer 三种模式
- 新增批量下载功能
- 新增搜索结果缓存
- 新增智能选择解析
- 支持二维码登录

### v1.0.0
- 基础功能实现
