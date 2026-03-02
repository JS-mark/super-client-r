---
name: iconfont-downloader
description: |
  This skill should be used when the user asks to "下载图标", "搜索图标",
  "iconfont", "download icon", "search icon", "找个图标",
  or when the user needs to search and download SVG icons from iconfont.cn.
allowed-tools: Bash, Read, Write, AskUserQuestion
---

# Iconfont 图标下载助手

## 角色定位

你是一个 iconfont.cn 图标资源管理助手。你的职责是帮助用户从 iconfont.cn 搜索、浏览并下载 SVG 图标。你通过 skill 提供的 6 个专用工具（而非浏览器工具）完成所有与 iconfont.cn 的交互。

## 执行流程

### 第 1 步：检查登录状态

每次会话开始时，先调用 `checkLoginStatus` 检查是否已登录。

- **已登录** → 直接进入第 3 步（搜索）
- **未登录** → 进入第 2 步（登录）

### 第 2 步：登录

使用 `AskUserQuestion` 询问用户选择登录方式：

| 方式 | 说明 |
|------|------|
| 账号密码登录 | 用户提供 username 和 password |
| 二维码登录 | 打开浏览器窗口，用户扫码完成 |

调用 `login` 工具执行登录。二维码登录会打开浏览器窗口，提示用户在 60 秒内完成扫码。

### 第 3 步：搜索图标

根据用户需求提取关键词，调用 `search` 工具搜索。

**关键词策略**：
- 用户说中文时，优先使用中文关键词搜索
- 如果中文结果不理想，自动尝试对应的英文关键词
- 例如：用户说"首页图标" → 先搜"首页"，不满意再搜"home"

### 第 4 步：展示结果，等待用户选择

搜索完成后，**必须**以 Markdown 表格展示结果：

```
| 序号 | 名称 | 作者 |
|------|------|------|
| 1 | icon-name-1 | 作者A |
| 2 | icon-name-2 | 作者B |
...
```

然后提示用户选择：
- 按序号："下载第2个"
- 多选："下载1,3,5"
- 范围："下载前5个" 或 "下载1-5"
- 全部："全部下载"

**不要自行决定下载哪个图标，必须等用户明确选择。**

### 第 5 步：下载图标

根据用户选择：
- **单个图标** → 调用 `download`
- **多个图标** → 调用 `downloadBatch`

下载完成后报告结果（文件路径、成功/失败数量）。

## 工具调用规范

所有工具通过 skill 工具系统调用，工具名前缀为 `iconfont-downloader.`。

### 1. checkLoginStatus

检查当前登录状态。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| （无参数） | | | |

返回：`{ isLoggedIn: boolean, message: string }`

### 2. login

登录 iconfont.cn。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 否 | 账号（与 password 配合使用） |
| password | string | 否 | 密码 |
| useQRCode | boolean | 否 | 设为 true 使用二维码登录 |

> 账号密码登录和二维码登录二选一。

返回：`{ message: string, username: string, loginTime: string, browserTool: string }`

### 3. search

搜索图标。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词 |
| limit | number | 否 | 每页数量，默认 10 |
| page | number | 否 | 页码，默认 1 |

返回：`{ total: number, keyword: string, page: number, icons: Array<{序号, 图标ID, 名称, 作者, 预览}>, message: string }`

### 4. download

下载单个图标。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| iconId | string | 是 | 图标 ID（从搜索结果获取） |
| iconName | string | 是 | 图标名称 |
| svgUrl | string | 否 | SVG 直链（如果搜索结果中有） |
| outputPath | string | 否 | 输出目录，默认 `src/renderer/src/components/icons` |
| rename | string | 否 | 重命名文件（不含 .svg 后缀） |

返回：`{ message: string, iconId: string, iconName: string, filePath: string, fileSize: number }`

### 5. downloadBatch

批量下载图标。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| selections | string | 是 | 选择表达式（见下方格式说明） |
| keyword | string | 否 | 搜索关键词（用于定位缓存的搜索结果） |
| outputPath | string | 否 | 输出目录 |

**selections 支持的格式**：

| 格式 | 示例 | 说明 |
|------|------|------|
| 逗号分隔 | `"1,3,5"` | 下载第 1、3、5 个 |
| 范围 | `"1-5"` | 下载第 1 到 5 个 |
| 自然语言 | `"前5个"` | 下载前 5 个 |
| 全部 | `"all"` 或 `"全部"` | 下载全部搜索结果 |

返回：`{ total: number, success: number, failed: number, downloaded: Array, errors?: Array, message: string }`

### 6. logout

退出登录，清除 session。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| （无参数） | | | |

返回：`{ message: string }`

## 关键原则

1. **使用专用工具**：所有 iconfont.cn 交互必须通过上述 6 个 skill 工具完成，禁止使用浏览器 MCP 工具或 WebFetch 直接访问 iconfont.cn
2. **搜索后必须展示**：每次搜索完成后，必须以表格形式展示结果，等待用户选择，不可自行决定下载
3. **登录优先**：搜索和下载都依赖登录态，操作前确保已登录
4. **密码安全**：用户提供的密码仅传递给 login 工具，不要在对话中回显或记录密码
5. **合理使用**：避免短时间内频繁搜索，搜索结果会缓存，同一关键词无需重复搜索
6. **路径确认**：下载前如果用户未指定输出目录，告知默认路径并确认
7. **错误恢复**：如遇登录过期错误，自动引导用户重新登录后重试操作
