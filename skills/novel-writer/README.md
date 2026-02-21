# novel-writer - 长篇小说创作助手

Claude Code 插件，提供长篇小说全流程创作能力：大纲架构、角色设计、章节连载、进度管理，支持网络素材搜索和配图生成。

## 安装方法

### 方法一：本地目录安装（开发/测试用）

```bash
# 直接指定插件目录启动 Claude Code
claude --plugin-dir /path/to/novel-writer
```

### 方法二：复制到 Claude 插件目录

```bash
# 1. 创建插件缓存目录
mkdir -p ~/.claude/plugins/cache/local/novel-writer/1.0.0

# 2. 复制插件文件
cp -r /path/to/novel-writer/* ~/.claude/plugins/cache/local/novel-writer/1.0.0/

# 3. 注册插件（编辑 installed_plugins.json）
# 打开 ~/.claude/plugins/installed_plugins.json，在 plugins 对象中添加：
```

```json
{
  "novel-writer@local": [
    {
      "scope": "user",
      "installPath": "~/.claude/plugins/cache/local/novel-writer/1.0.0",
      "version": "1.0.0",
      "installedAt": "2026-02-21T00:00:00.000Z",
      "lastUpdated": "2026-02-21T00:00:00.000Z"
    }
  ]
}
```

### 方法三：通过 Marketplace 安装（如已发布）

```bash
# 在 Claude Code 中运行
/install novel-writer
```

## 安装验证

安装后启动 Claude Code，输入以下任意内容验证 skill 是否加载：

- "帮我写小说"
- "我想创作一部都市修仙小说"
- "写大纲"

如果 skill 正确加载，Claude 会以小说作家的身份回应并引导创作流程。

## 插件结构

```
novel-writer/
├── .claude-plugin/
│   └── plugin.json              # 插件元数据
├── commands/
│   └── write.md                 # /write 斜杠命令
├── skills/
│   └── novel-writer/
│       ├── SKILL.md             # 核心技能定义
│       └── references/
│           ├── outline-template.md     # 大纲模板
│           ├── character-template.md   # 角色档案模板
│           └── writing-techniques.md   # 写作技巧参考
└── README.md                    # 本文件
```

## 功能概览

### 核心创作流程

| 阶段 | 说明 | 输出文件 |
|------|------|----------|
| 故事大纲 | 世界观、主线、分卷规划 | `novel/outline.md` |
| 角色大纲 | 角色档案、登场规划 | `novel/characters.md` |
| 章节创作 | 3000-5000字/章 | `novel/chapters/第X卷/第XXX章-标题.md` |
| 进度管理 | 每章自动更新 | `novel/progress.md` |

### 触发方式

**自动触发（Skill）：** 对话中提到写小说、创作、继续写等关键词时自动激活。

**手动触发（Command）：** 输入 `/write` 启动创作或继续下一章。

### 网络搜索

创作时可调用 WebSearch / WebFetch 搜索真实素材：
- 地名、文化、历史等背景知识
- 修仙体系、武术流派等专业素材
- 城市场景细节（街道、建筑、美食）
- 网文趋势和读者偏好

### 配图生成

支持三种方式为小说生成配图：

1. **MCP 工具** — 如果环境中有图片生成 MCP（如 Pencil），直接调用
2. **frontend-design skill** — 生成角色卡片、场景插图页面
3. **Prompt 导出** — 生成 Midjourney / DALL-E / SD 可用的图片描述 prompt

## 使用示例

```
用户：帮我写一部都市修仙小说
→ 进入大纲阶段，逐步讨论世界观、主线、分卷

用户：设计主角
→ 进入角色阶段，建立角色档案

用户：开始写第一章，主角在公司被辞退后偶遇神秘老人
→ 按概要展开写 3000-5000 字章节

用户：继续写 / 更新文章
→ 按大纲自动推进下一章

用户：帮主角生成一张角色立绘
→ 调用图片工具或生成 prompt

用户：搜索一下现代都市修仙的常见设定
→ 使用 WebSearch 搜索素材
```

## 文件管理

插件会在项目中创建以下目录结构来保存小说内容：

```
novel/
├── outline.md                   # 故事大纲
├── characters.md                # 角色档案
├── progress.md                  # 创作进度 & 伏笔管理
└── chapters/
    ├── 第1卷/
    │   ├── 第001章-标题.md
    │   ├── 第002章-标题.md
    │   └── ...
    ├── 第2卷/
    └── ...
```

## 许可证

MIT
