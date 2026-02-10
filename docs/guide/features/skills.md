# 技能系统

技能系统是 Super Client R 的扩展机制，允许你安装、开发和分享可复用的 AI 功能模块。

## 什么是技能？

技能（Skill）是一个独立的 AI 功能模块，包含：
- 预定义的提示词模板
- 自定义工具函数
- 特定的业务逻辑
- 配置界面

```
┌─────────────────────────────────────┐
│           Skill Package             │
├─────────────────────────────────────┤
│  📄 manifest.json    - 元数据       │
│  🔧 index.ts         - 主入口       │
│  💬 prompts/         - 提示词       │
│  🛠️ tools/           - 工具函数     │
│  ⚙️ config/          - 配置定义     │
│  🎨 assets/          - 资源文件     │
└─────────────────────────────────────┘
```

## 技能市场

### 浏览技能

1. 打开 **技能** 页面
2. 切换到 **市场** 标签
3. 浏览分类或使用搜索
4. 查看技能详情和评分

### 安装技能

**从市场安装：**

1. 找到需要的技能
2. 点击 **安装** 按钮
3. 等待下载完成
4. 技能自动启用

**从文件安装：**

1. 点击 **从文件安装**
2. 选择 `.skill` 或 `.zip` 文件
3. 确认安装信息

### 管理技能

**已安装技能：**

| 操作 | 说明 |
|------|------|
| 启用/禁用 | 控制技能是否可用 |
| 配置 | 修改技能参数 |
| 更新 | 升级到最新版本 |
| 卸载 | 删除技能 |

## 使用技能

### 在聊天中使用

1. 切换到 **Skill** 聊天模式
2. 从下拉菜单选择技能
3. 输入消息，技能会处理请求

### 快捷调用

使用 `/` 命令快速调用技能：

```
/translate 将这段文字翻译成英文
/code 生成一个排序算法
/search 搜索相关资料
```

## 开发技能

### 项目结构

```
my-skill/
├── manifest.json          # 技能元数据
├── index.ts               # 主入口
├── prompts/
│   └── main.txt           # 系统提示词
├── tools/
│   └── index.ts           # 工具定义
├── config/
│   └── schema.json        # 配置模式
└── assets/
    └── icon.svg           # 技能图标
```

### manifest.json

```json
{
  "id": "my-skill",
  "name": "My Skill",
  "version": "1.0.0",
  "description": "A sample skill for Super Client R",
  "author": "Your Name",
  "category": "productivity",
  "icon": "assets/icon.svg",
  "entry": "index.ts",
  "minAppVersion": "0.0.1",
  "permissions": [
    "network",
    "filesystem"
  ]
}
```

### 主入口 (index.ts)

```typescript
import type { SkillContext, SkillTool } from 'super-client-r';

export default class MySkill {
  private config: Record<string, any>;

  constructor(config: Record<string, any>) {
    this.config = config;
  }

  // 获取系统提示词
  getSystemPrompt(): string {
    return `You are a helpful assistant specialized in ${this.config.domain}.`;
  }

  // 定义工具
  getTools(): SkillTool[] {
    return [
      {
        name: 'search',
        description: 'Search for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
        handler: async (params) => {
          const result = await this.performSearch(params.query);
          return { success: true, data: result };
        },
      },
    ];
  }

  private async performSearch(query: string): Promise<string> {
    // 实现搜索逻辑
    return `Search results for: ${query}`;
  }
}
```

### 工具定义

```typescript
// tools/index.ts
import type { SkillTool } from 'super-client-r';

export const tools: SkillTool[] = [
  {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression to evaluate',
        },
      },
      required: ['expression'],
    },
    handler: async ({ expression }) => {
      try {
        // 注意：实际应用中需要使用安全的计算方式
        const result = eval(expression);
        return {
          success: true,
          data: { result },
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];
```

### 配置模式

```json
{
  "type": "object",
  "properties": {
    "apiKey": {
      "type": "string",
      "title": "API Key",
      "description": "Your API key for the service"
    },
    "endpoint": {
      "type": "string",
      "title": "API Endpoint",
      "default": "https://api.example.com"
    },
    "timeout": {
      "type": "number",
      "title": "Timeout (ms)",
      "default": 5000,
      "minimum": 1000,
      "maximum": 30000
    }
  },
  "required": ["apiKey"]
}
```

## 示例技能

### 翻译助手

```typescript
export default class TranslateSkill {
  getSystemPrompt(): string {
    return `You are a professional translator. Translate text accurately while preserving tone and style.`;
  }

  getTools() {
    return [
      {
        name: 'translate',
        description: 'Translate text to target language',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            targetLang: {
              type: 'string',
              enum: ['en', 'zh', 'ja', 'ko', 'fr', 'de'],
            },
          },
          required: ['text', 'targetLang'],
        },
        handler: async ({ text, targetLang }) => {
          // 调用翻译 API
          const result = await translateAPI(text, targetLang);
          return { success: true, data: result };
        },
      },
    ];
  }
}
```

### 代码审查

```typescript
export default class CodeReviewSkill {
  getSystemPrompt(): string {
    return `You are a senior software engineer. Review code for best practices, bugs, and improvements.`;
  }

  getTools() {
    return [
      {
        name: 'analyze_code',
        description: 'Analyze code quality',
        parameters: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            language: { type: 'string' },
          },
          required: ['code', 'language'],
        },
        handler: async ({ code, language }) => {
          // 分析代码
          const issues = await analyzeCode(code, language);
          return {
            success: true,
            data: {
              issues,
              suggestions: generateSuggestions(issues),
            },
          };
        },
      },
    ];
  }
}
```

## 发布技能

### 打包技能

```bash
# 使用 CLI 工具打包
npx super-client-skill pack ./my-skill

# 输出：my-skill-1.0.0.skill
```

### 提交到市场

1. 注册开发者账号
2. 上传技能包
3. 填写详细信息
4. 等待审核

### 私有分发

```bash
# 导出技能包
npx super-client-skill export ./my-skill --output ./dist

# 用户可以通过文件安装
```

## 最佳实践

### 1. 设计原则

- **单一职责**：每个技能只做一件事
- **可配置**：提供合理的配置选项
- **容错处理**：优雅处理错误情况
- **文档完善**：清晰的说明和示例

### 2. 安全性

- 验证所有输入
- 使用最小权限原则
- 不存储敏感信息
- 安全地处理用户数据

### 3. 性能优化

- 缓存重复请求
- 使用异步操作
- 设置合理的超时
- 避免阻塞主线程

## 故障排除

### 技能无法加载

1. 检查 manifest.json 格式
2. 验证文件路径
3. 查看控制台错误

### 工具调用失败

1. 检查参数类型
2. 验证 handler 返回值格式
3. 添加错误处理

### 配置不生效

1. 检查 schema.json 格式
2. 验证配置值类型
3. 重启应用后重试

## 参考

- [技能开发模板](https://github.com/your-org/skill-template)
- [API 文档](../api/types)
- [示例技能集合](https://github.com/your-org/example-skills)
