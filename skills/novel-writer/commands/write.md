---
description: 启动小说创作或继续写下一章
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

<novel-writer-command>

# /write 小说创作命令

所有文件存储在 `~/Desktop/novel/` 目录下。

## 第一步：加载存档（必须先执行）

无论何时触发此命令，**必须先加载已有创作数据**：

1. 使用 Glob 检查 `~/Desktop/novel/` 是否存在
2. 如果存在，**并行读取**以下文件：
   - `~/Desktop/novel/outline.md`（故事大纲）
   - `~/Desktop/novel/characters.md`（角色档案）
   - `~/Desktop/novel/progress.md`（创作进度）
3. 使用 Glob 查找 `~/Desktop/novel/chapters/**/*.md`，读取最近 1-2 章恢复上下文
4. 向用户汇报当前状态：
   ```
   📖 已加载创作存档
   书名：《XXX》
   当前进度：第X卷 · 第XX章
   上章概要：XXX
   下章预告：XXX
   ```

## 第二步：判断并执行

1. **如果 `~/Desktop/novel/outline.md` 不存在**：
   - 全新创作，使用 Bash 创建 `~/Desktop/novel/` 及子目录
   - 以热情友好的语气打招呼，介绍自己是创作搭档
   - 询问用户想创作什么类型的小说
   - 引导进入故事大纲阶段

2. **如果大纲存在但 `~/Desktop/novel/characters.md` 不存在**：
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
- 使用 Write 保存章节到 `~/Desktop/novel/chapters/第X卷/第XXX章-标题.md`
- 使用 Write/Edit 更新 `~/Desktop/novel/progress.md`
- 附上进度报告

</novel-writer-command>
