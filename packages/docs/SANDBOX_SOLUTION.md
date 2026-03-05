# Node.js 沙箱执行方案调研

## 一、方案总览

### 1. isolated-vm — V8 隔离方案

**原理**：利用 V8 引擎的 Isolate API，创建完全独立的 V8 实例，拥有独立的堆内存。

**特点**：

- 每个 Isolate 有独立的内存空间，无法访问宿主对象
- 支持内存限制和执行超时控制
- 性能高（V8 JIT 编译）
- 支持同步/异步执行
- 需要原生编译（C++ addon，依赖 node-gyp）

```typescript
import ivm from 'isolated-vm';

const isolate = new ivm.Isolate({ memoryLimit: 128 }); // 128MB 限制
const context = await isolate.createContext();
const jail = context.global;
await jail.set('log', new ivm.Callback(console.log));

const script = await isolate.compileScript('log("hello from sandbox")');
await script.run(context, { timeout: 1000 }); // 1秒超时
```

**适用场景**：需要高性能 + 完整 ES 支持的场景

**GitHub**: <https://github.com/laverdet/isolated-vm>

---

### 2. QuickJS + WebAssembly — 双重沙箱方案（推荐）

**原理**：将 QuickJS（轻量级 JS 引擎）编译为 WebAssembly，在 WASM 沙箱中运行独立的 JS 引擎。

**特点**：

- 双重隔离：WASM 线性内存 + 独立 JS 引擎
- 无需原生编译，纯 WASM
- 安全性最高（完全独立于 V8）
- 支持内存限制和中断执行
- 性能较低（解释执行，无 JIT）

**适用场景**：安全性要求最高、不需要极致性能的场景

**npm**: `quickjs-emscripten`
**GitHub**: <https://github.com/justjake/quickjs-emscripten>

---

### 3. Node.js Permission Model — 原生权限模型

**原理**：Node.js 20+ 实验性功能，在运行时层面限制文件系统、子进程、Worker 等访问权限。

**特点**：

- 原生支持，无需第三方库
- 通过 CLI flag 控制权限粒度
- 可用 `process.permission.has()` 运行时检查
- 仍为实验性功能
- 不防御原生 C++ addon 的绕过

```bash
# 只允许读 /tmp，禁止写文件、禁止子进程
node --experimental-permission --allow-fs-read=/tmp app.js

# 允许读任何文件，只写 /tmp
node --experimental-permission --allow-fs-read=* --allow-fs-write=/tmp app.js
```

**适用场景**：控制自身进程的权限边界、防御供应链攻击

**文档**: <https://nodejs.org/api/permissions.html>

---

### 4. SES (Secure ECMAScript) / Hardened JavaScript

**原理**：由 Agoric 推动的 TC39 提案，基于 Object Capability 安全模型，在语言层面冻结全局对象。

**特点**：

- 冻结所有内置对象（`Object.freeze` 全局原型链）
- Compartment API 提供隔离的全局作用域
- 纯 JS 实现，无原生依赖
- 不依赖特定运行时
- MetaMask 的 LavaMoat 基于此构建

```typescript
import 'ses';
lockdown(); // 冻结所有内置对象

const compartment = new Compartment({
  globals: { console }, // 只暴露 console
});
compartment.evaluate('console.log("sandboxed")');
// compartment.evaluate('process.exit()'); // ReferenceError!
```

**适用场景**：插件系统、需要语言级别隔离的场景

**GitHub**: <https://github.com/endojs/endo> (ses 包)

---

### 5. 容器级隔离 — Docker / gVisor / Firecracker

**原理**：在操作系统层面隔离，每段代码运行在独立容器或微型虚拟机中。

| 方案        | 隔离级别           | 启动速度 | 开销 |
|-------------|--------------------|----------|------|
| Docker      | 进程级 (namespace) | 秒级     | 低   |
| gVisor      | 系统调用拦截       | 秒级     | 中   |
| Firecracker | 微型 VM            | <125ms   | 中   |
| nsjail      | namespace 沙箱     | 极快     | 极低 |

**适用场景**：运行完全不可信的代码（在线编程平台、代码竞赛等）

---

### 6. WebAssembly 通用沙箱 — Extism / Wasmer

**原理**：将代码编译为 WASM 模块，在 WASM 运行时中执行。

**特点**：

- WASM 线性内存模型天然隔离
- 支持 fuel/gas 计量控制执行时间
- 支持多语言（不限于 JS）
- Extism 提供了插件框架

**适用场景**：通用插件系统、多语言沙箱

---

## 二、方案对比

| 维度             | isolated-vm | QuickJS WASM  | Node Permission | SES    | 容器           |
|------------------|-------------|---------------|-----------------|--------|----------------|
| **隔离强度**     | 强          | 很强          | 中              | 中     | 很强           |
| **性能**         | 高 (V8 JIT) | 低 (解释器)   | 原生            | 原生   | 取决于方案     |
| **原生依赖**     | 需要        | 不需要        | 不需要          | 不需要 | 需要 Docker 等 |
| **ES 兼容性**    | 完整        | ES2023 大部分 | 完整            | 完整   | 完整           |
| **CPU/内存限制** | 支持        | 支持          | 部分            | 不支持 | 支持           |
| **复杂度**       | 中          | 低            | 低              | 中     | 高             |

---

## 三、推荐方案：quickjs-emscripten 详细集成指南

### 3.1 项目概况

| 属性         | 值                                             |
|--------------|------------------------------------------------|
| **包名**     | `quickjs-emscripten`                           |
| **版本**     | 0.32.0                                         |
| **作者**     | justjake (Jake Teton-Landis)                   |
| **协议**     | MIT                                            |
| **ES 支持**  | 大部分 ES2023                                  |
| **运行环境** | Node.js, 浏览器, Deno, Bun, Cloudflare Workers |
| **灵感来源** | Figma 插件系统                                 |

### 3.2 安装

**完整包**（含 4 个 WASM 变体，约 9MB）：

```bash
pnpm add quickjs-emscripten
```

**最小化安装**（只要 1.3MB，推荐）：

```bash
pnpm add quickjs-emscripten-core @jitl/quickjs-wasmfile-release-sync
```

### 3.3 基础用法

#### 最简单的代码执行

```typescript
import { getQuickJS, shouldInterruptAfterDeadline } from 'quickjs-emscripten'

const QuickJS = await getQuickJS()

// 一行执行，带超时和内存限制
const result = QuickJS.evalCode('1 + 1', {
  shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + 1000), // 1秒超时
  memoryLimitBytes: 1024 * 1024, // 1MB 内存限制
})
console.log(result) // 2
```

#### 创建上下文，操作变量

```typescript
const vm = QuickJS.newContext()

// 创建值并设置到全局
const world = vm.newString('world')
vm.setProp(vm.global, 'NAME', world)
world.dispose() // 手动释放!

// 执行代码
const result = vm.evalCode(`"Hello " + NAME + "!"`)
if (result.error) {
  console.log('执行失败:', vm.dump(result.error))
  result.error.dispose()
} else {
  console.log('结果:', vm.dump(result.value)) // "Hello world!"
  result.value.dispose()
}

vm.dispose()
```

#### Runtime 级别控制（内存/CPU/模块加载）

```typescript
const runtime = QuickJS.newRuntime()

// 内存限制
runtime.setMemoryLimit(1024 * 640) // 640KB
// 栈大小限制
runtime.setMaxStackSize(1024 * 320)
// CPU 中断：每 1024 次检查中断一次
let interruptCycles = 0
runtime.setInterruptHandler(() => ++interruptCycles > 1024)

// ES Module 加载器
runtime.setModuleLoader((moduleName) => {
  return `export default '${moduleName}'`
})

const context = runtime.newContext()
const ok = context.evalCode(`
  import fooName from './foo.js'
  globalThis.result = fooName
`)
context.unwrapResult(ok).dispose()
console.log(context.getProp(context.global, 'result').consume(context.dump))
// => "foo.js"

context.dispose()
runtime.dispose()
```

### 3.4 暴露宿主 API 给沙箱

核心原则：**沙箱内默认没有任何宿主功能，需要显式注入。**

```typescript
const vm = QuickJS.newContext()

// 注入 console.log
const logHandle = vm.newFunction('log', (...args) => {
  const nativeArgs = args.map(vm.dump)
  console.log('QuickJS:', ...nativeArgs)
})
const consoleHandle = vm.newObject()
vm.setProp(consoleHandle, 'log', logHandle)
vm.setProp(vm.global, 'console', consoleHandle)
consoleHandle.dispose()
logHandle.dispose()

vm.unwrapResult(vm.evalCode(`console.log("Hello from sandbox!")`)).dispose()
```

### 3.5 Promise / 异步支持

#### 同步检查 Promise 状态

```typescript
const promiseHandle = context.evalCode(`Promise.resolve(42)`)
const resultHandle = context.unwrapResult(
  context.getPromiseState(promiseHandle)
)
context.getNumber(resultHandle) === 42 // true
```

#### 暴露异步函数给沙箱

```typescript
const readFileHandle = vm.newFunction('readFile', (pathHandle) => {
  const path = vm.getString(pathHandle)
  const promise = vm.newPromise()

  setTimeout(() => {
    const content = fakeFileSystem.get(path)
    promise.resolve(vm.newString(content || ''))
  }, 100)

  // 重要：异步操作完成后需手动触发执行队列
  promise.settled.then(vm.runtime.executePendingJobs)
  return promise.handle
})
```

#### Asyncify — 宿主异步，沙箱同步

沙箱内的代码写同步调用，但宿主实际异步执行：

```typescript
import { newAsyncContext } from 'quickjs-emscripten'

const context = await newAsyncContext()

// 注册异步函数，但沙箱内是同步调用
const readFileHandle = context.newAsyncifiedFunction(
  'readFile',
  async (pathHandle) => {
    const data = await fs.readFile(context.getString(pathHandle), 'utf-8')
    return context.newString(data)
  }
)
readFileHandle.consume((fn) => context.setProp(context.global, 'readFile', fn))

// 沙箱内代码 — readFile 是同步的！
const result = await context.evalCodeAsync(`
  const data = JSON.parse(readFile('data.json'))  // 同步！
  data.map(x => x.toUpperCase()).join(' ')
`)
```

**Asyncify 限制**：构建体积约 1MB（普通版 500KB 的 2 倍），且同一时间只能挂起等待一个异步操作。

### 3.6 内存管理

QuickJS WASM 堆上分配的对象**不会被 JS GC 自动回收**，必须手动 `.dispose()`。

#### 策略 1：`using` 声明（TypeScript 5.2+）

```typescript
using vm = QuickJS.newContext()
using fnHandle = vm.newFunction('nextId', () => vm.newNumber(++state))
// 离开作用域自动 dispose
```

#### 策略 2：Scope 管理器

```typescript
import { Scope } from 'quickjs-emscripten'

Scope.withScope((scope) => {
  const vm = scope.manage(QuickJS.newContext())
  const handle = scope.manage(vm.newString('hello'))
  // scope 结束时自动全部 dispose
})
```

#### 策略 3：`.consume()` 链式调用

```typescript
vm.newFunction('nextId', () => vm.newNumber(++state))
  .consume((fn) => vm.setProp(vm.global, 'nextId', fn))
```

### 3.7 构建变体

| 变体            | 用途                | 特点                       |
|-----------------|---------------------|----------------------------|
| `RELEASE_SYNC`  | 生产环境（默认）      | 最小、最快                  |
| `RELEASE_ASYNC` | 生产环境 + Asyncify | 支持异步挂起               |
| `DEBUG_SYNC`    | 开发测试            | 内存泄漏检测 + source maps |
| `DEBUG_ASYNC`   | 开发测试 + Asyncify | source maps                |

```typescript
import { newQuickJSWASMModule, DEBUG_SYNC } from 'quickjs-emscripten'
const QuickJS = await newQuickJSWASMModule(DEBUG_SYNC)
```

### 3.8 ES Module 支持

```typescript
const context = QuickJS.newContext()
const result = context.evalCode(
  `
  export const name = 'Jake'
  export const favoriteBean = 'wax bean'
  export default 'potato'
`,
  'jake.js',
  { type: 'module' },
)
const moduleExports = context.unwrapResult(result)
console.log(context.dump(moduleExports))
// -> { name: 'Jake', favoriteBean: 'wax bean', default: 'potato' }
moduleExports.dispose()
```

### 3.9 测试

```typescript
import { TestQuickJSWASMModule, newQuickJSWASMModule, DEBUG_SYNC } from 'quickjs-emscripten'

describe('Sandbox tests with memory leak detection', () => {
  let QuickJS: TestQuickJSWASMModule

  beforeEach(async () => {
    const wasmModule = await newQuickJSWASMModule(DEBUG_SYNC)
    QuickJS = new TestQuickJSWASMModule(wasmModule)
  })

  afterEach(() => {
    // DEBUG_SYNC 变体会显示每个泄漏的详细追踪
    QuickJS.assertNoMemoryAllocated()
  })

  it('executes code safely', () => {
    const context = QuickJS.newContext()
    context.unwrapResult(context.evalCode('1 + 1')).dispose()
    context.dispose()
  })
})
```

---

## 四、Super Client R 集成方案

### 4.1 架构设计

```
Renderer (UI)
    → IPC → Main Process (SandboxService)
              → quickjs-emscripten (WASM 沙箱)
```

### 4.2 SandboxService 实现

```typescript
// src/main/services/sandbox/SandboxService.ts
import { EventEmitter } from 'events'
import { getQuickJS, shouldInterruptAfterDeadline, Scope } from 'quickjs-emscripten'
import type { QuickJSWASMModule, QuickJSContext } from 'quickjs-emscripten'

export interface SandboxExecuteOptions {
  timeout?: number          // 默认 5000ms
  memoryLimit?: number      // 默认 10MB
  globals?: Record<string, unknown>
}

export interface SandboxResult {
  success: boolean
  data?: unknown
  error?: string
  logs?: Array<{ level: string; args: unknown[] }>
}

export class SandboxService extends EventEmitter {
  private module: QuickJSWASMModule | null = null

  async initialize(): Promise<void> {
    this.module = await getQuickJS()
    this.emit('initialized')
  }

  async executeCode(code: string, options?: SandboxExecuteOptions): Promise<SandboxResult> {
    if (!this.module) throw new Error('SandboxService not initialized')

    const logs: Array<{ level: string; args: unknown[] }> = []

    const runtime = this.module.newRuntime()
    runtime.setMemoryLimit(options?.memoryLimit ?? 10 * 1024 * 1024)
    runtime.setMaxStackSize(1024 * 320)

    const deadline = Date.now() + (options?.timeout ?? 5000)
    runtime.setInterruptHandler(() => Date.now() > deadline)

    const context = runtime.newContext()

    try {
      // 注入安全的全局变量
      if (options?.globals) {
        this.injectGlobals(context, options.globals)
      }

      // 注入 console
      this.injectConsole(context, logs)

      const result = context.evalCode(code)
      if (result.error) {
        const error = context.dump(result.error)
        result.error.dispose()
        return { success: false, error: String(error), logs }
      }

      const value = context.dump(result.value)
      result.value.dispose()
      return { success: true, data: value, logs }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        logs,
      }
    } finally {
      context.dispose()
      runtime.dispose()
    }
  }

  private injectConsole(context: QuickJSContext, logs: Array<{ level: string; args: unknown[] }>) {
    const consoleObj = context.newObject()

    for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      const fn = context.newFunction(level, (...args) => {
        const nativeArgs = args.map(context.dump)
        logs.push({ level, args: nativeArgs })
        this.emit('console', level, nativeArgs)
      })
      context.setProp(consoleObj, level, fn)
      fn.dispose()
    }

    context.setProp(context.global, 'console', consoleObj)
    consoleObj.dispose()
  }

  private injectGlobals(context: QuickJSContext, globals: Record<string, unknown>) {
    for (const [key, value] of Object.entries(globals)) {
      const handle = this.marshalValue(context, value)
      if (handle) {
        context.setProp(context.global, key, handle)
        handle.dispose()
      }
    }
  }

  private marshalValue(context: QuickJSContext, value: unknown) {
    if (value === null || value === undefined) return context.undefined
    if (typeof value === 'string') return context.newString(value)
    if (typeof value === 'number') return context.newNumber(value)
    if (typeof value === 'boolean') return value ? context.true : context.false
    if (typeof value === 'object') {
      // 序列化为 JSON 再在沙箱内解析，安全且简单
      const json = JSON.stringify(value)
      const jsonStr = context.newString(json)
      const parseResult = context.evalCode(`JSON.parse(${JSON.stringify(json)})`)
      jsonStr.dispose()
      if (parseResult.error) {
        parseResult.error.dispose()
        return null
      }
      return parseResult.value
    }
    return null
  }
}

export const sandboxService = new SandboxService()
```

### 4.3 IPC 集成

```typescript
// src/main/ipc/channels.ts
export const SANDBOX_CHANNELS = {
  EXECUTE: 'sandbox:execute',
} as const

// src/main/ipc/handlers/sandboxHandlers.ts
import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../channels'
import { sandboxService } from '../../services/sandbox/SandboxService'

export function registerSandboxHandlers() {
  ipcMain.handle(SANDBOX_CHANNELS.EXECUTE, async (_event, request) => {
    try {
      const result = await sandboxService.executeCode(
        request.payload.code,
        request.payload.options,
      )
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

// src/preload/index.ts (追加)
sandbox: {
  execute: (code: string, options?: SandboxExecuteOptions) =>
    ipcRenderer.invoke(SANDBOX_CHANNELS.EXECUTE, { payload: { code, options } }),
}

// src/renderer/src/services/sandboxService.ts
export const sandboxService = {
  execute: (code: string, options?: { timeout?: number; memoryLimit?: number; globals?: Record<string, unknown> }) =>
    window.electronAPI.sandbox.execute(code, options),
}
```

### 4.4 最小化安装方式

```typescript
// src/main/services/sandbox/SandboxService.ts
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core'
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync'

export class SandboxService extends EventEmitter {
  private module: QuickJSWASMModule | null = null

  async initialize(): Promise<void> {
    this.module = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC)
    this.emit('initialized')
  }
  // ... 其余不变
}
```

安装依赖：

```bash
pnpm add quickjs-emscripten-core @jitl/quickjs-wasmfile-release-sync
```

体积从 9MB 降到 1.3MB。

---

## 五、注意事项

| 事项               | 说明                                                    |
|--------------------|---------------------------------------------------------|
| **内存泄漏**       | 所有 handle 必须 `.dispose()`，建议用 `using` 或 `Scope` |
| **DEBUG 构建测试** | 开发时用 `DEBUG_SYNC` 变体可自动检测内存泄漏            |
| **Asyncify 限制**  | 同一时刻只能挂起等待一个异步操作                        |
| **无原生 API**     | 沙箱内没有 `fs`、`net`、`process` 等，需要手动注入         |
| **Vite 兼容**      | 已测试通过 Vite 5.x，与项目技术栈兼容                    |
| **ES Module**      | 支持 `evalCode` 中使用 `type: 'module'` 执行 ES Module  |
| **平台支持**       | Node.js 16+, Chrome 63+, Safari 11.1+, Firefox 58+      |

---

## 六、参考链接

- [quickjs-emscripten GitHub](https://github.com/justjake/quickjs-emscripten)
- [quickjs-emscripten NPM](https://www.npmjs.com/package/quickjs-emscripten)
- [quickjs-emscripten-core 文档](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten-core/README.md)
- [API 文档](https://github.com/justjake/quickjs-emscripten/blob/main/doc/packages.md)
- [isolated-vm GitHub](https://github.com/laverdet/isolated-vm)
- [Node.js Permission Model](https://nodejs.org/api/permissions.html)
- [SES / Endo GitHub](https://github.com/endojs/endo)
- [Figma: How we built the plugin system](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- [Figma: An update on plugin security](https://www.figma.com/blog/an-update-on-plugin-security/)
