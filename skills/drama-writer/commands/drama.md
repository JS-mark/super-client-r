---
description: 启动短剧剧本创作或继续写下一集
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, AskUserQuestion
---

<drama-writer-command>

## 执行步骤

### 步骤一：确定路径 + 加载存档

1. 如果用户在 `/drama` 后指定了路径（如 `/drama ~/my-project`），使用该路径作为 `<DRAMA_ROOT>`
2. 如果之前的对话中已经确定过路径，沿用该路径
3. 否则使用默认路径 `~/Desktop/drama/`

确定路径后：

- 使用 **Glob** 检查 `<DRAMA_ROOT>/project.md` 是否存在
- 如果存在，依次 **Read** 以下文件恢复上下文：
  - `<DRAMA_ROOT>/project.md` — 项目配置
  - `<DRAMA_ROOT>/outline.md` — 故事大纲
  - `<DRAMA_ROOT>/characters.md` — 角色档案
  - `<DRAMA_ROOT>/progress.md` — 创作进度
- 使用 **Glob** `<DRAMA_ROOT>/episodes/EP*.md` 查找已有剧本，**Read** 最近1-2集恢复剧情上下文

汇报当前状态：

```
📺 项目：《剧名》
📱 平台：竖屏短剧 / 横屏微短剧
🎭 题材：XX类型
📊 进度：已完成 XX/XX 集
🪝 上集钩子：[上一集结尾悬念]
➡️ 下集预告：[下一集核心冲突]
```

### 步骤二：判断当前阶段并执行

根据已有文件判断应进入哪个阶段：

**情况 A: 无 project.md** → 全新项目
- 进入「阶段一：项目设置」
- 使用 AskUserQuestion 引导用户选择平台类型、题材、集数等
- 完成后自动进入「阶段二：故事大纲」

**情况 B: 有 project.md，无 outline.md** → 需要写大纲
- 进入「阶段二：故事大纲」
- 参照 `references/outline-template.md` 模板
- 参照 `references/genre-templates.md` 中对应类型的结构

**情况 C: 有 outline.md，无 characters.md** → 需要设计角色
- 进入「阶段三：角色设计」
- 参照 `references/character-template.md` 模板

**情况 D: 有 characters.md，outline.md 中无分集大纲** → 需要写分集大纲
- 进入「阶段四：分集大纲」
- 为每集规划核心冲突和结尾钩子

**情况 E: 分集大纲已有，可以写剧本** → 剧本创作
- 进入「阶段五：剧本创作」
- 从 progress.md 确定下一集集号
- 按分集大纲写下一集

### 步骤三：创作输出

无论处于哪个阶段，完成创作后：

1. **保存文件** — 保存到对应路径：
   - 大纲 → `<DRAMA_ROOT>/outline.md`
   - 角色 → `<DRAMA_ROOT>/characters.md`
   - 剧本 → `<DRAMA_ROOT>/episodes/EPXXX-标题.md`
   - 分镜 → `<DRAMA_ROOT>/storyboard/EPXXX-分镜.md`

2. **更新进度** — 更新 `<DRAMA_ROOT>/progress.md`：
   - 记录完成状态
   - 更新伏笔跟踪
   - 标注大纲偏离（如有）
   - 写下集预告

3. **汇报结果** — 附上创作报告：
   ```
   ✅ 已完成：EPXXX《标题》
   📊 台词字数：XXXX字
   🎬 场景数：X场
   🪝 本集钩子：[结尾悬念]
   ➡️ 下集预告：[下集核心冲突]
   ```

</drama-writer-command>
