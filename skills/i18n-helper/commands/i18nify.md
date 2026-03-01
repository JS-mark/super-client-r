---
description: 将指定文件或代码中的硬编码文本替换为 i18n 多语言调用
allowed-tools: Read, Edit, Write, Glob, Grep, AskUserQuestion
---

<i18nify>

## 执行步骤

### 步骤一：确定目标范围

检查用户是否指定了文件路径或代码片段：
- 如果指定了文件路径，读取该文件
- 如果指定了代码片段，分析该片段
- 如果都没有指定，使用 AskUserQuestion 询问用户要处理哪个文件

### 步骤二：扫描硬编码文本

在目标代码中识别以下类型的硬编码文本：

1. **JSX 中的中文/英文文本**：`<span>设置</span>`、`<Button>Save</Button>`
2. **字符串属性中的文本**：`title="设置"`、`placeholder="请输入"`
3. **变量赋值中的 UI 文本**：`const label = "保存"`
4. **Ant Design 组件的文本属性**：`message.success("操作成功")`、`Modal.confirm({ title: "确认删除" })`

不处理的内容：
- console.log / console.error 中的文本
- 注释
- CSS class 名
- 纯英文的技术标识符（如 API key、URL、事件名）
- 已经使用 `t()` 的文本

### 步骤三：确定 namespace

根据文件所在目录和功能模块，确定应该使用哪个 i18n namespace：

| 文件路径模式 | Namespace |
|------------|-----------|
| `components/chat/` or `pages/Chat.tsx` | chat |
| `components/settings/` | settings |
| `components/mcp/` | mcp |
| `components/skill/` | skills |
| `components/plugin/` or `pages/Plugin*.tsx` | plugins |
| `components/workspace/` or `pages/Workspaces.tsx` | workspaces |
| `components/models/` | models |
| `components/logviewer/` | logviewer |
| `components/attachment/` | attachment |
| `components/layout/` | app |
| `pages/FloatWidget.tsx` | window |
| `components/ErrorBoundary.tsx` | error |
| 通用按钮/操作文本（保存、取消等） | common |

如果无法确定，使用 AskUserQuestion 询问用户。

### 步骤四：生成 translation key

Translation key 命名规则：

1. **使用 camelCase**：`saveChanges`、`confirmDelete`
2. **使用嵌套分组**：按功能分组，如 `actions.save`、`messages.deleteSuccess`
3. **复用已有 key**：先在对应 namespace 的 JSON 文件中搜索，如果已有相同含义的 key 则直接复用
4. **命名语义化**：key 要能反映文本含义，不要用 `text1`、`label2` 这种无意义命名

常见分组前缀：
- `title` / `subtitle` - 标题
- `actions.*` - 按钮和操作
- `messages.*` - 提示消息（success / error / confirm）
- `labels.*` - 表单标签
- `placeholders.*` - 占位文本
- `tooltips.*` - 提示信息
- `status.*` - 状态文本
- `validation.*` - 校验提示
- `tabs.*` - 标签页

### 步骤五：展示变更计划

使用 AskUserQuestion 向用户展示变更计划，包括：
- 发现的硬编码文本列表
- 每个文本对应的 translation key
- 对应的 en / zh 翻译值
- 将要修改的文件列表

选项：
- 确认执行 (Recommended)
- 修改后执行
- 取消

### 步骤六：更新语言文件

1. 读取 `src/renderer/src/i18n/locales/en/<namespace>.json`
2. 读取 `src/renderer/src/i18n/locales/zh/<namespace>.json`
3. 将新增的 key-value 追加到对应的 JSON 文件
4. 保持 JSON 文件中已有 key 的顺序不变，新增 key 追加到同级的末尾
5. 确保 JSON 格式正确，使用 2 空格缩进

### 步骤七：替换源代码中的硬编码文本

1. 确保文件中已导入 `useTranslation`：
   ```typescript
   import { useTranslation } from 'react-i18next';
   ```

2. 确保组件内部已调用 `useTranslation`：
   ```typescript
   const { t } = useTranslation();
   ```

3. 替换硬编码文本为 `t()` 调用：
   - JSX 文本：`<span>设置</span>` → `<span>{t("title", { ns: "settings" })}</span>`
   - 属性值：`title="设置"` → `title={t("title", { ns: "settings" })}`
   - 字符串变量：`const label = "保存"` → `const label = t("save")`
   - 模板字符串：`已安装 ${name}` → `t("messages.installed", { ns: "skills", name })`

4. 如果 namespace 是 `common`（defaultNS），可以省略 `{ ns: "common" }`：
   - `t("save")` 而不是 `t("save", { ns: "common" })`

5. 如果文件中所有 key 都在同一个非 common namespace，可以在 `useTranslation` 中指定 namespace：
   ```typescript
   const { t } = useTranslation("settings");
   // 然后直接用 t("title") 而不需要 { ns: "settings" }
   ```

### 步骤八：验证

1. 检查修改后的代码语法是否正确
2. 确认 en 和 zh 的 JSON 文件都已更新
3. 确认 key 没有重复或冲突

</i18nify>
