---
description: 启动小说创作或继续写下一章
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

<novel-writer-command>

# /write 小说创作命令

默认存储路径 `~/Desktop/novel/`，用户可通过 `/write /path/to/my-novel` 或对话中指定自定义路径。确定后的路径记为 `<NOVEL_ROOT>`。

## 第一步：确定路径并加载存档（必须先执行）

1. **确定 `<NOVEL_ROOT>`**：
   - 如果命令带参数（如 `/write ~/Documents/my-story`），使用该路径
   - 如果用户之前在对话中指定过路径，沿用该路径
   - 否则使用默认路径 `~/Desktop/novel/`
2. 使用 Glob 检查 `<NOVEL_ROOT>/` 是否存在
3. 如果存在，**并行读取**以下文件：
   - `<NOVEL_ROOT>/outline.md`（故事大纲）
   - `<NOVEL_ROOT>/characters.md`（角色档案）
   - `<NOVEL_ROOT>/progress.md`（创作进度）
4. 使用 Glob 查找 `<NOVEL_ROOT>/chapters/**/*.md`，读取最近 1-2 章恢复上下文
5. 向用户汇报当前状态：
   ```
   📖 已加载创作存档
   存储路径：<NOVEL_ROOT>
   书名：《XXX》
   当前进度：第X卷 · 第XX章
   上章概要：XXX
   下章预告：XXX
   ```

## 第二步：判断并执行

1. **如果 `<NOVEL_ROOT>/outline.md` 不存在**：
   - 全新创作
   - 使用 AskUserQuestion 询问是否使用默认路径 `~/Desktop/novel/`，还是自定义路径
   - 确认后使用 Bash 创建 `<NOVEL_ROOT>/` 及 `chapters/` 子目录
   - 以热情友好的语气打招呼，介绍自己是创作搭档
   - 询问用户想创作什么类型的小说
   - 引导进入故事大纲阶段

2. **如果大纲存在但 `<NOVEL_ROOT>/characters.md` 不存在**：
   - 大纲已完成，角色档案未完成
   - 引导用户进入角色设计阶段

3. **如果大纲和角色都存在**：
   - 根据 progress.md 和大纲确定下一章走向
   - 直接开始创作下一章

## 第三步：创作输出

### 创作时
- 严格按照故事大纲推进
- 每章 3000-5000 中文字符
- 章末必须有钩子
- 如需素材，使用 WebSearch 搜索

### 创作后
- 使用 Write 保存章节到 `<NOVEL_ROOT>/chapters/第X卷/第XXX章-标题.md`
- 使用 Write/Edit 更新 `<NOVEL_ROOT>/progress.md`
- 附上进度报告

</novel-writer-command>
