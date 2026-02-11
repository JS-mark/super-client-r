---
name: iconfont-downloader
description: |
  Iconfont图标下载器 Skill 可以帮助用户从 iconfont.cn 搜索并下载最匹配的 SVG 图标。
---

# Iconfont图标下载器 Skill

从 iconfont.cn 搜索并下载最匹配的 SVG 图标。

## 功能特性

- 🔐 支持 iconfont.cn 账号登录
- 🔍 关键词搜索图标
- 📋 列出搜索结果供用户选择
- 💾 下载 SVG 到指定目录
- 🔄 支持批量下载

## 安装方法

### 方法1：通过 Skill 市场安装（推荐）

待 Skill 市场上线后，可以直接在应用内搜索 "iconfont-downloader" 安装。

### 方法2：手动安装

1. 将整个 `iconfont-downloader` 目录复制到应用的 skills 目录：
   - Windows: `%APPDATA%/SuperClientR/skills/`
   - macOS: `~/Library/Application Support/SuperClientR/skills/`
   - Linux: `~/.config/SuperClientR/skills/`

2. 重启应用，在设置中启用该 skill

### 方法3：开发模式安装

```bash
# 在项目根目录执行
pnpm skill:install ./skills/iconfont-downloader
```

## 依赖安装

此 skill 需要 `puppeteer` 或 `playwright` 来处理登录和页面爬取：

```bash
cd skills/iconfont-downloader
npm install puppeteer
# 或者
npm install playwright
```

## 使用方法

### 1. 登录

首先必须登录 iconfont.cn：

```json
{
  "tool": "iconfont-downloader.login",
  "input": {
    "username": "your_username",
    "password": "your_password"
  }
}
```

**注意**：如果登录失败，其他工具将无法使用。

### 2. 搜索图标

```json
{
  "tool": "iconfont-downloader.search",
  "input": {
    "keyword": "home",
    "limit": 10,
    "page": 1
  }
}
```

返回结果示例：

```json
{
  "success": true,
  "output": {
    "total": 3,
    "keyword": "home",
    "icons": [
      {
        "序号": 1,
        "图标ID": "1234567",
        "名称": "home-icon-1",
        "作者": "设计师A",
        "下载链接": "https://example.com/icon1.svg"
      },
      {
        "序号": 2,
        "图标ID": "1234568",
        "名称": "home-icon-2",
        "作者": "设计师B",
        "下载链接": "https://example.com/icon2.svg"
      }
    ],
    "message": "找到 2 个与\"home\"相关的图标",
    "nextStep": "请查看上方的图标列表，告诉我你想下载哪个（提供序号或ID）"
  }
}
```

### 3. 下载图标

根据搜索结果，选择要下载的图标：

```json
{
  "tool": "iconfont-downloader.download",
  "input": {
    "iconId": "1234567",
    "iconName": "home-icon-1",
    "outputPath": "./src/renderer/src/components/icons",
    "rename": "HomeIcon"
  }
}
```

参数说明：

- `iconId` (必需): 图标 ID
- `iconName` (必需): 图标名称
- `outputPath` (可选): 保存目录，默认保存到 `src/renderer/src/components/icons`
- `rename` (可选): 重命名文件，不包含扩展名

### 4. 检查登录状态

```json
{
  "tool": "iconfont-downloader.checkLoginStatus",
  "input": {}
}
```

### 5. 退出登录

```json
{
  "tool": "iconfont-downloader.logout",
  "input": {}
}
```

## 使用流程示例

```
用户: 帮我下载一个搜索图标

AI: 我需要先登录 iconfont.cn。请提供你的用户名和密码。

用户: 用户名是 test@example.com，密码是 123456

AI: [调用 login 工具登录]

AI: 登录成功！现在搜索搜索图标...
[调用 search 工具，keyword="search"]

AI: 找到 10 个相关图标：
1. ID: 111 - search-line (作者: A)
2. ID: 112 - search-fill (作者: B)
3. ID: 113 - search-outline (作者: C)
...

请问你想下载哪个？可以告诉我序号或ID。

用户: 下载第2个

AI: [调用 download 工具，iconId="112"]

AI: 图标下载成功！已保存到 src/renderer/src/components/icons/search-fill.svg
```

## 目录结构

```
iconfont-downloader/
├── manifest.json      # Skill 配置
├── index.ts          # 主实现文件
├── index.js          # 编译后的 JS 文件
├── README.md         # 说明文档
└── package.json      # 依赖配置
```

## 开发计划

- [ ] 实现基于 puppeteer 的真实登录
- [ ] 实现 iconfont API 调用
- [ ] 支持批量下载
- [ ] 支持图标库导入
- [ ] 支持自定义颜色下载

## 注意事项

1. **登录安全**：密码会在内存中临时存储，不会保存到磁盘
2. **Session 有效期**：iconfont 的 session 可能会过期，需要重新登录
3. **反爬虫**：请合理使用，避免频繁请求导致账号受限
4. **版权问题**：下载的图标请遵守原作者的版权声明

## 故障排除

### 登录失败

- 检查用户名和密码是否正确
- 检查是否需要验证码（目前需要手动在浏览器中完成验证）
- 检查网络连接

### 搜索无结果

- 尝试使用英文关键词
- 检查是否已登录
- 检查网络连接

### 下载失败

- 检查目标目录是否有写入权限
- 检查磁盘空间
- 检查是否已登录

## 许可证

MIT
