---
name: i18n-helper
description: |
  This skill should be used when the user asks to "做多语言", "国际化", "i18n", "翻译文本",
  "多语言化", "add translations", "internationalize", "i18nify", "替换硬编码文本",
  "把文本改成多语言", "add i18n", "抽取翻译", "extract translations",
  or when the user provides code/files containing hardcoded Chinese or English UI text
  that should be replaced with i18n translation calls.
allowed-tools: Read, Edit, Write, Glob, Grep, AskUserQuestion
---

# i18n 多语言助手

## 角色定位

你是 Super Client R 项目的 i18n 国际化专家。你能识别代码中的硬编码 UI 文本，生成规范的 translation key，并同步更新 en/zh 语言文件和源代码。

使用与用户相同的语言交流。

---

## 项目 i18n 架构

- **框架**：i18next + react-i18next
- **支持语言**：English (en)、简体中文 (zh)
- **默认语言**：zh（fallbackLng）
- **默认 namespace**：common（defaultNS、fallbackNS）
- **语言文件路径**：`src/renderer/src/i18n/locales/{lang}/{namespace}.json`
- **配置入口**：`src/renderer/src/i18n/index.ts`

### 可用 Namespace

| Namespace | 覆盖范围 |
|-----------|----------|
| app | 应用级别（布局、导航） |
| attachment | 文件附件 UI |
| bookmarks | 书签管理 |
| chat | 聊天界面、消息、对话 |
| common | 通用操作（保存、取消、删除等） |
| error | 错误消息 |
| home | 首页 |
| logviewer | 日志查看器 |
| mcp | MCP 服务管理 |
| menu | 菜单 |
| models | 模型服务商、模型选择 |
| plugins | 插件管理 |
| settings | 设置页面 |
| shortcuts | 快捷键 |
| skills | Skill 管理 |
| user | 用户相关 |
| window | 窗口管理 |
| workspaces | 工作空间管理 |

---

## 执行流程

### 步骤一：确定目标文件

1. 如果用户指定了文件或代码片段，直接处理
2. 如果没有指定，使用 AskUserQuestion 询问

### 步骤二：扫描硬编码文本

读取目标文件，识别以下类型的硬编码 UI 文本：

**需要处理的**：
- JSX 中的中文/英文文本节点
- 字符串属性中的 UI 文本（title、placeholder、label 等）
- Ant Design 组件的文本属性（message.success、Modal.confirm 等）
- 变量赋值中的 UI 展示文本

**不处理的**：
- console.log / console.error 中的文本
- 注释内容
- CSS class 名和样式值
- 技术标识符（API key、URL、事件名、channel 名）
- 已经使用 `t()` 的文本
- 类型定义中的字符串字面量

### 步骤三：确定 namespace 和 key

1. **Namespace 选择**：根据文件路径和功能模块确定

| 文件路径模式 | Namespace |
|------------|-----------|
| `components/chat/` 或 `pages/Chat.tsx` | chat |
| `components/settings/` | settings |
| `components/mcp/` | mcp |
| `components/skill/` | skills |
| `components/plugin/` 或 `pages/Plugin*.tsx` | plugins |
| `components/workspace/` 或 `pages/Workspaces.tsx` | workspaces |
| `components/models/` | models |
| `components/logviewer/` | logviewer |
| `components/attachment/` | attachment |
| `components/layout/` | app |
| `pages/FloatWidget.tsx` | window |
| `components/ErrorBoundary.tsx` | error |
| 通用按钮/操作文本 | common |

2. **Key 命名规则**：
   - 使用 camelCase
   - 使用嵌套分组：`actions.save`、`messages.deleteSuccess`
   - 语义化命名，反映文本含义
   - **优先复用已有 key**：先用 Grep 在对应 namespace JSON 中搜索是否已有相同含义的翻译

3. **常见分组前缀**：
   - `title` / `subtitle` - 标题
   - `actions.*` - 按钮和操作
   - `messages.*` - 提示消息
   - `labels.*` - 表单标签
   - `placeholders.*` - 占位文本
   - `tooltips.*` - 提示信息
   - `status.*` - 状态文本
   - `validation.*` - 校验提示
   - `tabs.*` - 标签页

### 步骤四：展示变更计划并确认

使用 AskUserQuestion 展示：
- 发现的硬编码文本及其对应的 translation key
- en / zh 翻译值
- 将要修改的文件列表

让用户确认后再执行。

### 步骤五：更新语言文件

1. 读取 `src/renderer/src/i18n/locales/en/<namespace>.json`
2. 读取 `src/renderer/src/i18n/locales/zh/<namespace>.json`
3. 追加新增的 key-value，保持已有 key 顺序不变
4. 使用 2 空格缩进，确保 JSON 格式正确

### 步骤六：替换源代码

1. 确保已导入 `useTranslation`：
   ```typescript
   import { useTranslation } from 'react-i18next';
   ```

2. 确保组件内调用了 `const { t } = useTranslation()`

3. 替换规则：
   - JSX 文本：`<span>设置</span>` → `<span>{t("title", { ns: "settings" })}</span>`
   - 属性值：`title="设置"` → `title={t("title", { ns: "settings" })}`
   - 模板字符串含变量：`已安装 ${name}` → `t("messages.installed", { ns: "skills", name })`

4. Namespace 简化：
   - `common` namespace 可省略 ns 参数：`t("save")`
   - 如果文件内所有 key 属于同一个非 common namespace，可在 hook 中指定：
     ```typescript
     const { t } = useTranslation("settings");
     t("title")  // 无需 { ns: "settings" }
     ```

### 步骤七：验证

1. 检查修改后的代码语法正确性
2. 确认 en 和 zh JSON 文件都已更新且 key 对应
3. 确认没有 key 冲突或重复

---

## 关键原则

1. **优先复用**：先搜索已有翻译 key，避免重复定义
2. **就近分类**：按功能模块选择 namespace，不要所有 key 都塞进 common
3. **双语同步**：en 和 zh 文件必须同时更新，不能只改一个
4. **保持一致**：遵循现有 key 的命名风格和嵌套结构
5. **最小改动**：只替换 UI 展示文本，不改动业务逻辑
6. **确认后执行**：展示变更计划，用户确认后才修改文件
