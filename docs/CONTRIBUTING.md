# 开发贡献指南

感谢您对 Super Client R 项目的关注！本指南将帮助您快速了解如何参与项目开发。

---

## 目录

1. [开发环境搭建](#开发环境搭建)
2. [项目结构](#项目结构)
3. [开发流程](#开发流程)
4. [代码规范](#代码规范)
5. [提交规范](#提交规范)
6. [功能开发指南](#功能开发指南)
7. [调试技巧](#调试技巧)
8. [常见问题](#常见问题)

---

## 开发环境搭建

### 前置要求

| 工具    | 版本要求  | 说明          |
|---------|-----------|---------------|
| Node.js | >= 22.0.0 | 使用 nvm 管理 |
| pnpm    | >= 9.0.0  | 包管理器      |
| Git     | >= 2.40.0 | 版本控制      |

### 环境搭建步骤

```bash
# 1. 克隆仓库
git clone https://github.com/js-mark/super-client-r.git
cd super-client-r

# 2. 安装依赖
pnpm install

# 3. 启动开发服务器
pnpm dev
```

### 验证环境

```bash
# 类型检查
pnpm check

# 代码检查
pnpm lint

# 构建测试
pnpm build
```

---

## 项目结构

```
src/
├── main/                   # Electron 主进程 (Node.js)
│   ├── ipc/               # IPC 通信
│   │   ├── channels.ts    # IPC 通道定义
│   │   ├── types.ts       # IPC 类型定义
│   │   └── handlers/      # IPC 处理器
│   ├── services/          # 业务服务
│   │   ├── agent/         # Agent 服务
│   │   ├── mcp/           # MCP 服务
│   │   └── skill/         # Skill 服务
│   ├── server/            # Koa HTTP 服务器
│   ├── store/             # 持久化存储
│   └── main.ts            # 主进程入口
│
├── preload/               # 预加载脚本
│   └── index.ts           # 安全桥梁
│
└── renderer/              # 渲染进程 (React)
    ├── pages/             # 页面组件
    ├── components/        # UI 组件
    ├── hooks/             # 自定义 Hooks
    ├── stores/            # Zustand 状态管理
    ├── services/          # 服务客户端
    └── types/             # TypeScript 类型
```

---

## 开发流程

### 1. 创建功能分支

```bash
# 从 main 分支创建
git checkout main
git pull origin main

# 创建功能分支
git checkout -b feat/your-feature-name

# 或修复分支
git checkout -b fix/bug-description
```

### 2. 开发工作流

```bash
# 启动开发服务器（热重载）
pnpm dev

# 开发过程中保持类型检查
pnpm check --watch

# 提交前检查代码
pnpm lint
pnpm format
```

### 3. 提交代码

```bash
# 添加更改
git add .

# 提交（遵循提交规范）
git commit -m "feat: add new feature"

# 推送到远程
git push origin feat/your-feature-name
```

### 4. 创建 Pull Request

1. 在 GitHub 上创建 PR
2. 填写 PR 模板
3. 等待代码审查
4. 合并到 main 分支

---

## 代码规范

### TypeScript 规范

```typescript
// ✅ 正确：显式类型定义
interface UserConfig {
  apiKey: string;
  model: string;
  theme: 'light' | 'dark';
}

function createUser(config: UserConfig): User {
  // 实现
}

// ❌ 错误：隐式 any
function badFunction(data) {
  return data.value;
}
```

### React 组件规范

```typescript
// ✅ 正确：函数组件 + Hooks
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({
  label,
  onClick,
  variant = 'primary'
}: ButtonProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(() => {
    setIsLoading(true);
    onClick();
    setIsLoading(false);
  }, [onClick]);

  return (
    <button
      className={cn(
        'px-4 py-2 rounded',
        variant === 'primary' && 'bg-blue-500 text-white',
        variant === 'secondary' && 'bg-gray-200 text-gray-800'
      )}
      onClick={handleClick}
      disabled={isLoading}
    >
      {t(label)}
    </button>
  );
}
```

### IPC 开发规范（6 步流程）

**必须遵循**以下 6 个步骤添加 IPC 功能：

```typescript
// Step 1: 定义通道 (src/main/ipc/channels.ts)
export const FEATURE_CHANNELS = {
  ACTION: 'feature:action',
} as const;

// Step 2: 定义类型 (src/main/ipc/types.ts)
export interface FeatureRequest {
  data: string;
}

export interface FeatureResponse {
  result: string;
}

// Step 3: 实现处理器 (src/main/ipc/handlers/featureHandler.ts)
export function registerFeatureHandlers() {
  ipcMain.handle(FEATURE_CHANNELS.ACTION, async (event, request: IPCRequest<FeatureRequest>) => {
    try {
      const result = await processAction(request.payload);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// Step 4: 注册处理器 (src/main/ipc/index.ts)
import { registerFeatureHandlers } from './handlers/featureHandler';
export function registerIpcHandlers() {
  registerFeatureHandlers();
}

// Step 5: 暴露 API (src/preload/index.ts)
contextBridge.exposeInMainWorld('electronAPI', {
  feature: {
    action: (request: FeatureRequest) =>
      ipcRenderer.invoke(FEATURE_CHANNELS.ACTION, request),
  },
});

// Step 6: 创建客户端 (src/renderer/src/services/featureService.ts)
export const featureService = {
  action: (data: string) => window.electronAPI.feature.action({ data }),
};
```

### Zustand Store 规范

```typescript
// src/renderer/src/stores/featureStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeatureState {
  items: string[];
  isLoading: boolean;
  addItem: (item: string) => void;
  fetchItems: () => Promise<void>;
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      addItem: (item) => set((state) => ({
        items: [...state.items, item]
      })),
      fetchItems: async () => {
        set({ isLoading: true });
        try {
          const items = await api.fetchItems();
          set({ items, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    {
      name: 'feature-storage',
      partialize: (state) => ({ items: state.items }),
    }
  )
);
```

---

## 提交规范

### Commit Message 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

| 类型       | 说明                 |
|------------|----------------------|
| `feat`     | 新功能               |
| `fix`      | 修复 bug             |
| `docs`     | 文档更新             |
| `style`    | 代码格式（不影响功能） |
| `refactor` | 重构                 |
| `perf`     | 性能优化             |
| `test`     | 测试相关             |
| `chore`    | 构建/工具相关        |

### 示例

```bash
# 新功能
git commit -m "feat(agent): add streaming response support"

# Bug 修复
git commit -m "fix(mcp): resolve connection timeout issue"

# 文档更新
git commit -m "docs: update API documentation"

# 重构
git commit -m "refactor(stores): simplify chat store logic"
```

---

## 功能开发指南

### 添加新页面

1. **创建页面组件**

```typescript
// src/renderer/src/pages/NewPage.tsx
import { useTranslation } from 'react-i18next';

export function NewPage() {
  const { t } = useTranslation();

  return (
    <div className="p-4">
      <h1>{t('newPage.title')}</h1>
    </div>
  );
}
```

2. **添加路由**

```typescript
// src/renderer/src/router.tsx
import { NewPage } from './pages/NewPage';

{
  path: '/new-page',
  element: <NewPage />,
}
```

3. **添加菜单项**

```typescript
// 在菜单配置中添加
{
  key: 'new-page',
  label: t('menu.newPage'),
  path: '/new-page',
}
```

4. **添加国际化**

```typescript
// src/renderer/src/i18n/locales/zh-CN.json
{
  "newPage": {
    "title": "新页面"
  },
  "menu": {
    "newPage": "新页面"
  }
}
```

### 添加新 IPC 功能

参考 [IPC 开发规范](#ipc-开发规范6-步流程) 的 6 步流程。

### 添加新 Skill

```typescript
// 1. 创建技能目录
// src/main/services/skill/built-in/my-skill/

// 2. 创建 manifest.json
{
  "id": "my-skill",
  "name": "My Skill",
  "version": "1.0.0",
  "description": "Skill description",
  "tools": [
    {
      "name": "my_tool",
      "description": "Tool description",
      "parameters": {
        "type": "object",
        "properties": {
          "input": { "type": "string" }
        }
      }
    }
  ]
}

// 3. 实现工具处理
export async function myToolHandler(args: { input: string }) {
  // 实现逻辑
  return { result: 'success' };
}
```

---

## 调试技巧

### 主进程调试

```bash
# 启动开发模式（带调试）
pnpm dev

# 在 VS Code 中附加调试器
# 1. 按 Cmd+Shift+P
# 2. 选择 "Debug: Attach to Node Process"
# 3. 选择 Electron 主进程
```

### 渲染进程调试

```bash
# 开发模式下自动打开 DevTools
# 或按 Cmd+Option+I (Mac) / Ctrl+Shift+I (Windows)
```

### IPC 调试

```typescript
// 在 preload 中添加日志
const debugIPC = (channel: string, ...args: unknown[]) => {
  console.log(`[IPC] ${channel}:`, ...args);
};

// 包装 IPC 调用
action: (request) => {
  debugIPC(FEATURE_CHANNELS.ACTION, request);
  return ipcRenderer.invoke(FEATURE_CHANNELS.ACTION, request);
}
```

### 常见问题排查

| 问题       | 解决方案                |
|------------|-------------------------|
| IPC 无响应 | 检查 handler 是否已注册 |
| 类型错误   | 运行 `pnpm check`       |
| 构建失败   | 清除 `out/` 目录重试    |
| HMR 不工作 | 重启开发服务器          |

---

## 常见问题

### Q: 如何添加新的依赖？

```bash
# 主进程依赖
pnpm add -D package-name

# 渲染进程依赖
pnpm add package-name

# 类型定义
pnpm add -D @types/package-name
```

### Q: 如何更新 Electron 版本？

```bash
# 查看可用版本
npm view electron versions

# 更新到指定版本
pnpm update electron@latest

# 测试后提交
pnpm check && pnpm build
```

### Q: 如何调试 MCP 服务器？

```typescript
// 启用 MCP 调试日志
const mcpService = new McpService({
  debug: true,
});

// 查看日志输出
// ~/.super-client/logs/mcp.log
```

### Q: 如何添加新的语言支持？

1. 创建语言文件 `src/renderer/src/i18n/locales/xx-XX.json`
2. 在 i18n 配置中添加语言
3. 翻译所有键值

### Q: 如何贡献内置 Skill？

1. 在 `src/main/services/skill/built-in/` 创建目录
2. 实现 `manifest.json` 和工具处理函数
3. 在 SkillService 中注册
4. 添加文档和测试

---

## 代码审查清单

提交 PR 前请确认：

- [ ] 代码遵循项目规范
- [ ] 类型检查通过 (`pnpm check`)
- [ ] 代码检查通过 (`pnpm lint`)
- [ ] 构建成功 (`pnpm build`)
- [ ] 提交信息符合规范
- [ ] 添加/更新了测试
- [ ] 更新了相关文档

---

## 获取帮助

- **GitHub Issues**: 报告 bug 或请求功能
- **Discussions**: 讨论和问答
- **Documentation**: 查看 `docs/` 目录

---

## 许可证

本项目采用 [MIT 许可证](../LICENSE)。

感谢您的贡献！
