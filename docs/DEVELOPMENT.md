# 开发指南

## 环境要求

| 工具    | 版本要求 | 说明       |
|---------|----------|------------|
| Node.js | >= 22    | 运行时环境 |
| pnpm    | >= 10    | 包管理器   |
| Git     | >= 2.40  | 版本控制   |

---

## 快速开始

### 1. 安装依赖

```bash
# 使用 pnpm 安装 (推荐)
pnpm install

# 或使用 corepack
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

### 2. 启动开发服务器

```bash
# 开发模式 (热重载)
pnpm dev

# 这将同时启动:
# - Vite dev server (渲染进程)
# - Electron main process
# - 文件变更监听 (自动重启)
```

### 3. 构建应用

```bash
# 开发构建
pnpm build:dev

# 生产构建
pnpm build

# 打包应用
pnpm build && pnpm dist
```

---

## 项目脚本

### 开发

| 命令           | 说明           |
|----------------|----------------|
| `pnpm dev`     | 启动开发服务器 |
| `pnpm preview` | 预览生产构建   |

### 代码质量

| 命令               | 说明                    |
|--------------------|-------------------------|
| `pnpm check`       | TypeScript 类型检查     |
| `pnpm lint`        | oxlint 代码检查         |
| `pnpm lint:biome`  | Biome 代码检查          |
| `pnpm format`      | 格式化代码              |
| `pnpm check:biome` | Biome 全面检查 (含修复) |

### 国际化

| 命令                  | 说明             |
|-----------------------|------------------|
| `pnpm i18n:check`     | 检查翻译完整性   |
| `pnpm i18n:translate` | 自动翻译缺失词条 |

### 构建

| 命令                  | 说明                       |
|-----------------------|----------------------------|
| `pnpm build`          | 完整构建 (main + renderer) |
| `pnpm build:main`     | 仅构建主进程               |
| `pnpm build:renderer` | 仅构建渲染进程             |

---

## 开发工作流

### 功能开发流程

```
1. 创建功能分支
   git checkout -b feat/feature-name

2. 开发功能
   - 编写代码
   - 添加/更新类型定义
   - 更新 i18n (如需要)

3. 代码检查
   pnpm check          # 类型检查
   pnpm lint           # 代码检查
   pnpm format         # 格式化

4. 本地测试
   pnpm dev            # 手动测试

5. 提交代码
   git add .
   git commit -m "feat(scope): description"

6. 推送并创建 PR
   git push origin feat/feature-name
```

### 调试

#### 主进程调试

```bash
# 方式1: VS Code
# 1. 在代码中添加断点
# 2. F5 启动调试

# 方式2: 命令行
pnpm dev --remote-debugging-port=9223
```

#### 渲染进程调试

```bash
# 开发工具
Ctrl+Shift+I (Windows/Linux)
Cmd+Option+I (macOS)

# 或通过菜单
View → Toggle Developer Tools
```

#### 日志查看

```typescript
// 主进程日志
import { logger } from '@/utils/logger';
logger.info('message');
logger.error('error', error);

// 渲染进程日志
console.log('message');  // 在 DevTools 中查看
```

---

## 项目配置

### TypeScript 配置

```json
// tsconfig.json - 根配置
{
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}

// tsconfig.node.json - 主进程 + 预加载
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "include": ["src/main/**/*", "src/preload/**/*"]
}

// tsconfig.web.json - 渲染进程
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx"
  },
  "include": ["src/renderer/**/*"]
}
```

### Vite 配置

```typescript
// electron.vite.config.ts
export default defineConfig({
  main: {
    entry: 'src/main/main.ts',
    outDir: 'out/main',
  },
  preload: {
    entry: 'src/preload/index.ts',
    outDir: 'out/preload',
  },
  renderer: {
    root: 'src/renderer',
    outDir: 'out/renderer',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
  },
});
```

---

## 常见开发任务

### 添加新页面

```typescript
// 1. 创建页面组件
// src/renderer/src/pages/NewPage.tsx

import { useTranslation } from 'react-i18next';

export default function NewPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <h1>{t('newPage.title')}</h1>
    </div>
  );
}

// 2. 添加路由
// src/renderer/src/router.tsx
import NewPage from './pages/NewPage';

{
  path: '/new',
  element: <NewPage />,
}

// 3. 添加菜单项 (如需)
// src/renderer/src/components/layout/MainLayout.tsx

// 4. 添加 i18n
// src/renderer/src/i18n/locales/en/common.json
{
  "newPage": {
    "title": "New Page"
  }
}
```

### 添加新 IPC 通道

```typescript
// 1. 定义通道
// src/main/ipc/channels.ts
export const NEW_CHANNELS = {
  ACTION: 'module:action',
};

// 2. 定义类型
// src/main/ipc/types.ts
export interface NewRequest {
  data: string;
}

export interface NewResponse {
  result: string;
}

// 3. 实现处理器
// src/main/ipc/handlers/newHandlers.ts
import { ipcMain } from 'electron';
import { NEW_CHANNELS } from '../channels';

export function registerNewHandlers() {
  ipcMain.handle(NEW_CHANNELS.ACTION, async (event, request) => {
    try {
      const result = await processAction(request);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// 4. 注册处理器
// src/main/ipc/index.ts
import { registerNewHandlers } from './handlers/newHandlers';

export function registerIpcHandlers() {
  // ...
  registerNewHandlers();
}

// 5. 暴露 API
// src/preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  // ...
  newAction: (request) => ipcRenderer.invoke('module:action', request),
});

// 6. 客户端封装
// src/renderer/src/services/newService.ts
export const newService = {
  action: (data: string) =>
    window.electronAPI.newAction({ data }),
};
```

### 添加新 Store

```typescript
// src/renderer/src/stores/featureStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeatureState {
  data: string[];
  addData: (item: string) => void;
  removeData: (id: string) => void;
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set) => ({
      data: [],
      addData: (item) =>
        set((state) => ({ data: [...state.data, item] })),
      removeData: (id) =>
        set((state) => ({
          data: state.data.filter((item) => item.id !== id),
        })),
    }),
    {
      name: 'feature-storage',
    }
  )
);
```

### 添加 i18n 翻译

```typescript
// 1. 在组件中使用
import { useTranslation } from 'react-i18next';

function Component() {
  const { t } = useTranslation();

  return <div>{t('key.nested.value')}</div>;
}

// 2. 添加翻译文件
// src/renderer/src/i18n/locales/en/common.json
{
  "key": {
    "nested": {
      "value": "English Text"
    }
  }
}

// src/renderer/src/i18n/locales/zh/common.json
{
  "key": {
    "nested": {
      "value": "中文文本"
    }
  }
}

// 3. 检查翻译完整性
pnpm i18n:check

// 4. 自动翻译缺失词条
pnpm i18n:translate
```

---

## 常见问题

### 问题1: 模块解析失败

```
Error: Cannot find module '@/components/Button'
```

**解决方案**:

- 检查 `tsconfig.web.json` paths 配置
- 重启 TypeScript 服务
- 检查文件是否存在

### 问题2: IPC 通信失败

```
Error: No handler registered for 'channel:name'
```

**解决方案**:

- 确认处理器已注册 (`src/main/ipc/index.ts`)
- 检查通道名称拼写
- 确认预加载脚本已正确暴露 API

### 问题3: 样式不生效

```
Tailwind classes not working
```

**解决方案**:

- 检查 `index.css` 是否正确导入
- 确认 Tailwind CSS v4 配置
- 重启开发服务器

### 问题4: 热重载失效

**解决方案**:

```bash
# 完全重启
Ctrl+C
pnpm dev

# 清除缓存
rm -rf node_modules/.vite
```

---

## 性能优化

### 开发时

- 使用 `React DevTools Profiler` 分析渲染性能
- 使用 `Zustand DevTools` 调试状态
- 启用 Vite 的 `optimizeDeps` 预构建

### 生产构建

```bash
# 分析包大小
pnpm build --analyze

# 检查性能
# 使用 Chrome DevTools Performance 面板
```

---

## 发布流程

### 本地构建发布（推荐）

使用 `pnpm release` 脚本进行本地构建和发布，它封装了完整的构建流水线。

#### 基本用法

```bash
pnpm release <platform> [options]
```

#### 平台参数

| 参数  | 说明                        |
|-------|-----------------------------|
| `mac` | 构建 macOS（dmg + zip）     |
| `win` | 构建 Windows（nsis exe）    |
| `all` | 构建所有平台                |

#### 可选参数

| 参数              | 说明                                              |
|-------------------|---------------------------------------------------|
| `--arch <arch>`   | 目标架构：`x64` 或 `arm64`，默认两者都构建        |
| `--mode <mode>`   | Vite 构建模式（对应 `electron-vite build --mode`） |
| `--publish`       | 构建完成后上传到 GitHub Release                    |
| `--tag <tag>`     | 指定 Release tag，默认取 `package.json` 的 `v{version}` |
| `-h, --help`      | 显示帮助信息                                       |

#### 常用示例

```bash
# 构建 macOS 双架构 (x64 + arm64)
pnpm release mac

# 仅构建 macOS arm64 (Apple Silicon)
pnpm release mac --arch arm64

# 仅构建 macOS x64
pnpm release mac --arch x64

# 构建 Windows 双架构
pnpm release win

# 构建所有平台
pnpm release all

# 指定 Vite 构建模式
pnpm release mac --mode production

# 构建并发布到 GitHub Release（自动使用 package.json 版本号）
pnpm release mac --publish

# 构建并发布到指定 tag
pnpm release mac --publish --tag v1.0.0

# 构建所有平台并发布
pnpm release all --publish
```

#### 构建流水线

脚本会按顺序执行以下步骤：

1. **清理** — 删除 `dist/` 目录
2. **构建图标** — `pnpm build:icons`
3. **TypeScript 编译** — `tsc -b`
4. **Vite 打包** — `electron-vite build`
5. **平台打包** — `electron-builder --<platform> --<arch>`
6. **列出产物** — 显示 `dist/` 下的安装包及大小
7. **发布**（可选） — 通过 `gh` CLI 上传到 GitHub Release

#### 前置要求

- 发布功能（`--publish`）依赖 [GitHub CLI](https://cli.github.com/)
- 使用前需完成认证：`gh auth login`
- 如果 Release 已存在，会追加上传产物（`--clobber` 覆盖同名文件）
- tag 包含 `-`（如 `v1.0.0-beta.1`）会自动标记为 Prerelease

#### 构建产物

产物输出在 `dist/` 目录：

| 平台    | 文件格式              |
|---------|-----------------------|
| macOS   | `.dmg`, `.zip`        |
| Windows | `.exe`                |

### 快捷构建命令

如果只需要构建（不需要 release 脚本的完整流程），也可以使用：

```bash
pnpm build:mac    # tsc + vite build + electron-builder --mac
pnpm build:win    # tsc + vite build + electron-builder --win
pnpm build        # tsc + vite build + electron-builder (默认平台)
```

### CI/CD 自动发布

项目配置了 GitHub Actions 自动构建发布（`.github/workflows/release.yml`）：

- **触发方式**：推送 `v*` tag 或手动触发 workflow_dispatch
- **构建矩阵**：macOS (x64 + arm64) + Windows (x64 + arm64)
- **流程**：自动构建 → 上传 artifacts → 创建 GitHub Release

```bash
# 通过 tag 触发 CI 发布
git tag v1.0.0
git push origin v1.0.0
```

手动触发时可指定 Vite 构建模式和 Release tag。
