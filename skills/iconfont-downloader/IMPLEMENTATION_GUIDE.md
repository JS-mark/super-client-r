# Iconfont Skill 实现指南

## 当前状态

此 skill 已创建基础框架，但 skill 执行系统需要进一步完善才能完全运行。

## 已完成的组件

### 1. `manifest.json`

- 定义了 5 个工具：login, search, download, checkLoginStatus, logout
- 配置了权限和元数据

### 2. `index.ts`

- 完整的 TypeScript 实现框架
- 包含所有工具的函数定义
- 导出 `execute` 函数作为入口点

### 3. `puppeteer-impl.example.ts`

- 使用 Puppeteer 的完整实现示例
- 包含登录、搜索、下载的具体代码

## 需要完成的步骤

### 步骤1：完善 SkillService 的执行逻辑

当前 `SkillService.executeSkill()` 方法只是返回模拟结果。需要修改以下文件：

**文件**: `src/main/services/skill/SkillService.ts`

```typescript
// 在 executeSkill 方法中添加实际执行逻辑
async executeSkill(
  skillId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<SkillExecutionResult> {
  // ... 现有验证代码 ...

  if (!implExists) {
    return {
      success: false,
      error: `Skill ${skillId} has no implementation file`,
    };
  }

  try {
    // 加载 skill 模块
    const skillModule = await import(implPath);

    if (typeof skillModule.execute !== 'function') {
      return {
        success: false,
        error: `Skill ${skillId} does not export an execute function`,
      };
    }

    // 执行 skill
    const result = await skillModule.execute(toolName, input);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Execution failed',
    };
  }
}
```

### 步骤2：安装 Puppeteer 依赖

```bash
cd skills/iconfont-downloader
npm install

# 或者如果你使用项目的包管理器
pnpm add puppeteer --filter iconfont-downloader-skill
```

### 步骤3：编译 TypeScript

```bash
cd skills/iconfont-downloader
npx tsc index.ts --outDir . --target ES2020 --module ESNext --moduleResolution node
```

### 步骤4：安装 Skill 到应用

#### 方法A：开发模式（推荐）

1. 将整个 `iconfont-downloader` 目录复制到应用数据目录：
   - macOS: `~/Library/Application Support/SuperClientR/skills/iconfont-downloader/`
   - Windows: `%APPDATA%/SuperClientR/skills/iconfont-downloader/`
   - Linux: `~/.config/SuperClientR/skills/iconfont-downloader/`

2. 重启应用

#### 方法B：通过 IPC 安装

```typescript
// 在渲染进程中执行
const skillClient = new SkillClient();
await skillClient.installSkill('/path/to/iconfont-downloader');
```

### 步骤5：测试 Skill

1. 打开应用
2. 导航到 Settings → Skills
3. 应该能看到 "Iconfont图标下载器"
4. 确保 skill 已启用

## 用户交互流程

由于当前 skill 系统不支持直接的 UI 交互，需要按照以下流程使用：

### 流程1：AI 辅助交互

```
用户: 帮我下载一个 home 图标

AI: 我需要先登录 iconfont.cn。你有账号吗？

用户: 有，用户名是 xxx，密码是 yyy

[AI 调用 login 工具]

AI: 登录成功！现在搜索 home 图标...

[AI 调用 search 工具]

AI: 找到以下图标：
1. home-fill (ID: 12345) - 作者: A
2. home-line (ID: 12346) - 作者: B
3. home-outline (ID: 12347) - 作者: C

你想下载哪一个？

用户: 下载第1个

[AI 调用 download 工具，iconId="12345"]

AI: 已下载 home-fill.svg 到 src/renderer/src/components/icons/
```

### 流程2：预设配置（无需交互）

对于不需要交互的场景，可以预设参数：

```typescript
// 预设登录信息（不推荐用于生产环境）
await skillClient.executeSkill('iconfont-downloader', 'login', {
  username: process.env.ICONFONT_USER,
  password: process.env.ICONFONT_PASS,
});

// 直接下载指定ID的图标
await skillClient.executeSkill('iconfont-downloader', 'download', {
  iconId: '12345',
  iconName: 'home',
  outputPath: './src/icons',
});
```

## 安全考虑

### 1. 密码处理

当前实现中，密码作为参数传递给 skill。更安全的方式：

```typescript
// 在 SkillService 中添加加密存储
class SkillService {
  private async storeCredentials(skillId: string, credentials: object) {
    // 使用 electron-store 加密存储
    const encrypted = await this.encrypt(JSON.stringify(credentials));
    this.store.set(`skills.${skillId}.credentials`, encrypted);
  }
}
```

### 2. 浏览器隔离

Puppeteer 应该运行在独立的进程中：

```typescript
// 使用 child_process 隔离
import { fork } from 'child_process';

async executeSkill(skillId: string, toolName: string, input: object) {
  const child = fork('./skill-runner.js');

  return new Promise((resolve, reject) => {
    child.send({ skillId, toolName, input });

    child.on('message', (result) => {
      resolve(result);
      child.kill();
    });

    child.on('error', reject);
  });
}
```

### 3. 沙箱执行

考虑使用 VM2 或类似的沙箱：

```typescript
import { VM } from 'vm2';

const vm = new VM({
  timeout: 1000,
  sandbox: {
    console,
    fetch,
    // 限制可用的 API
  },
});

const result = vm.run(skillCode);
```

## 调试技巧

### 1. 查看 Puppeteer 浏览器

在 `puppeteer-impl.example.ts` 中设置 `headless: false`：

```typescript
browser = await puppeteer.launch({
  headless: false, // 可见浏览器窗口
  slowMo: 250,     // 减慢操作以便观察
});
```

### 2. 启用详细日志

```typescript
// 在 index.ts 中添加日志
console.log('[Iconfont Skill]', message);

// 在 SkillService 中捕获日志
this.emit('log', { skillId, message, level: 'info' });
```

### 3. 使用 DevTools

```typescript
// 启用 Puppeteer 的 DevTools
browser = await puppeteer.launch({
  devtools: true,
});
```

## 常见问题

### Q: iconfont 的反爬虫机制

iconfont 可能有以下反爬虫措施：

- 验证码（需要手动处理）
- IP 限制（使用代理）
- 请求频率限制（添加延迟）

解决方案：

1. 使用 `headless: false` 让用户手动完成验证
2. 添加随机延迟模拟人工操作
3. 使用已登录的 cookies

### Q: 如何获取 iconfont 的 API

iconfont 没有公开的 API，需要：

1. 打开浏览器开发者工具
2. 监控网络请求
3. 分析接口参数和响应格式

### Q: 登录状态保持

保存 cookies 到文件，下次启动时加载：

```typescript
// 保存
const cookies = await page.cookies();
await fs.writeFile('cookies.json', JSON.stringify(cookies));

// 加载
const cookies = JSON.parse(await fs.readFile('cookies.json'));
await page.setCookie(...cookies);
```

## 扩展功能建议

1. **批量下载**: 支持一次下载多个图标
2. **图标库同步**: 下载整个图标库
3. **颜色自定义**: 下载时指定颜色
4. **格式转换**: 支持 PNG、React 组件等格式
5. **缓存机制**: 避免重复下载相同图标

## 相关文件

- `manifest.json` - Skill 配置
- `index.ts` - 主实现
- `puppeteer-impl.example.ts` - Puppeteer 示例
- `README.md` - 使用说明
- `package.json` - 依赖配置

## 联系和支持

如有问题，请：

1. 查看浏览器控制台日志
2. 检查 Puppeteer 截图
3. 确认 iconfont 网站结构未变更
