# Iconfont 图标下载器 Skill

从 iconfont.cn 搜索并下载 SVG 图标。支持账号密码登录、二维码登录，搜索后展示结果让用户选择下载。

## 功能特性

- 多种登录方式：支持账号密码登录、二维码登录
- 关键词搜索：中英文关键词搜索图标
- 结果展示：搜索后以表格形式展示，让用户选择
- 单个/批量下载：支持单个或批量下载图标
- 搜索结果缓存：同一关键词无需重复搜索

## 安装方法

### 方法 1：通过 Skill 市场安装（推荐）

待 Skill 市场上线后，可以直接在应用内搜索 "iconfont-downloader" 安装。

### 方法 2：手动安装

1. 将整个 `iconfont-downloader` 目录复制到应用的 skills 目录：
   - Windows: `%APPDATA%/SuperClientR/skills/`
   - macOS: `~/Library/Application Support/SuperClientR/skills/`
   - Linux: `~/.config/SuperClientR/skills/`

2. 重启应用，在设置中启用该 skill

### 方法 3：开发模式安装

```bash
pnpm skill:install ./skills/iconfont-downloader
```

## 依赖安装

此 skill 会自动检测并使用以下浏览器自动化工具（按优先级排序）：

1. **MCP 浏览器工具**（如果可用）- 无需额外安装
2. **Playwright** - `pnpm add playwright`
3. **Puppeteer** - `pnpm add puppeteer`

如果检测到 MCP 浏览器工具，无需安装其他依赖。

## 使用方法

在聊天中使用自然语言即可触发，例如：

- "帮我下载一个首页图标"
- "搜索 iconfont 上的 home 图标"
- "找个搜索图标下载到项目里"

AI 会自动引导完成登录 → 搜索 → 选择 → 下载的完整流程。

### 工具列表

| 工具 | 说明 |
|------|------|
| `checkLoginStatus` | 检查登录状态 |
| `login` | 登录（账号密码或二维码） |
| `search` | 搜索图标 |
| `download` | 下载单个图标 |
| `downloadBatch` | 批量下载图标 |
| `logout` | 退出登录 |

### 批量下载选择格式

| 格式 | 示例 | 说明 |
|------|------|------|
| 逗号分隔 | `"1,3,5"` | 下载第 1、3、5 个 |
| 范围 | `"1-5"` | 下载第 1 到 5 个 |
| 自然语言 | `"前5个"` | 下载前 5 个 |
| 全部 | `"all"` 或 `"全部"` | 下载全部 |

## 目录结构

```
iconfont-downloader/
├── scripts/
│   ├── manifest.json      # Skill 配置
│   ├── index.ts           # 主实现文件
│   ├── index.js           # 编译后的 JS 文件
│   └── package.json       # 依赖配置
├── SKILL.md               # AI 指令文件
├── IMPLEMENTATION_GUIDE.md # 实现指南
└── README.md              # 本说明文档
```

## 注意事项

1. **登录安全**：密码仅在登录过程中使用，不会保存到磁盘。登录 session 以 cookies 形式保存在内存中
2. **Session 有效期**：iconfont 的 session 可能会过期，如遇到登录失效错误需要重新登录
3. **反爬虫**：请合理使用，避免频繁请求
4. **版权问题**：下载的图标请遵守原作者的版权声明，商用请注意图标授权协议
5. **浏览器依赖**：首次使用 Playwright/Puppeteer 可能需要下载浏览器

## 故障排除

### 登录失败

- 检查用户名和密码是否正确
- 检查是否需要验证码（当前需要手动在浏览器中完成验证）
- 检查网络连接
- 尝试使用二维码登录

### 搜索无结果

- 尝试使用英文关键词
- 检查是否已登录
- 检查登录状态是否过期

### 下载失败

- 检查目标目录是否有写入权限
- 检查磁盘空间
- 检查是否已登录

### 浏览器工具未检测到

```bash
cd skills/iconfont-downloader
pnpm add playwright
# 或
pnpm add puppeteer
```

## 更新日志

### v2.0.0

- 新增批量下载功能 (`downloadBatch`)
- 支持多种浏览器自动化方式（MCP > Playwright > Puppeteer）
- 搜索结果缓存机制
- 智能选择解析（支持序号、范围、自然语言）
- 重构登录流程，支持二维码登录

### v1.0.0

- 初始版本
- 基础登录、搜索、下载功能

## 许可证

MIT
