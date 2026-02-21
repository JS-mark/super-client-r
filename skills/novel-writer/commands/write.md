---
description: 启动小说创作或继续写下一章
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

<novel-writer-command>

# /write 小说创作命令

根据用户输入决定执行的操作：

## 判断逻辑

1. **如果项目中不存在 `novel/outline.md`**：
   - 这是一个全新的创作项目
   - 以热情友好的语气打招呼，介绍自己是创作搭档
   - 询问用户想创作什么类型的小说
   - 引导进入故事大纲阶段

2. **如果存在 `novel/outline.md` 但不存在 `novel/characters.md`**：
   - 大纲已完成，角色档案未完成
   - 读取大纲，引导用户进入角色设计阶段

3. **如果大纲和角色都存在**：
   - 读取 `novel/progress.md` 了解当前进度
   - 读取最近的章节文件了解上下文
   - 根据大纲确定下一章的走向
   - 直接开始创作下一章

## 执行步骤

### 创作前准备
- 使用 Read 工具读取 `novel/outline.md`（如存在）
- 使用 Read 工具读取 `novel/characters.md`（如存在）
- 使用 Read 工具读取 `novel/progress.md`（如存在）
- 使用 Glob 工具查找最近的章节文件

### 创作时
- 严格按照故事大纲推进
- 每章 3000-5000 中文字符
- 章末必须有钩子
- 如需素材，使用 WebSearch 搜索

### 创作后
- 使用 Write 工具保存章节到 `novel/chapters/第X卷/第XXX章-标题.md`
- 使用 Write/Edit 工具更新 `novel/progress.md`
- 附上进度报告

</novel-writer-command>
