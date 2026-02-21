# 模型管理

Super Client R 支持连接多种 AI 模型供应商，提供统一的模型管理界面，让你灵活选择和切换不同的 AI 模型。

## 支持的供应商

Super Client R 内置了 24 个模型供应商的预设配置：

| 供应商 | 说明 | 需要 API Key |
|--------|------|:------------:|
| 阿里云百炼 (DashScope) | 通义千问系列模型 | 是 |
| DeepSeek | DeepSeek 系列模型 | 是 |
| OpenAI | GPT 系列模型 | 是 |
| Anthropic | Claude 系列模型 | 是 |
| Google Gemini | Gemini 系列模型 | 是 |
| CherryIN | CherryIN 模型服务 | 是 |
| 硅基流动 (SiliconFlow) | 国产模型聚合平台 | 是 |
| AihubMix | 多模型聚合服务 | 是 |
| ocoolAI | ocoolAI 模型服务 | 是 |
| 智谱 AI | GLM 系列模型 | 是 |
| 302.AI | AI 聚合服务 | 是 |
| 月之暗面 (Moonshot) | Kimi 系列模型 | 是 |
| 百川 (Baichuan) | 百川系列模型 | 是 |
| 火山引擎 (Volcengine) | 豆包系列模型 | 是 |
| MiniMax | MiniMax 模型 | 是 |
| 腾讯混元 | 混元系列模型 | 是 |
| Grok | xAI Grok 模型 | 是 |
| GitHub Models | GitHub 托管模型 | 是 |
| Hugging Face | 开源模型推理 | 是 |
| OpenRouter | 模型路由聚合 | 是 |
| Ollama | 本地模型运行 | 否 |
| LM Studio | 本地模型运行 | 否 |
| NewAPI | NewAPI 服务 | 是 |
| 自定义 (Custom) | 任意 OpenAI 兼容 API | 否 |

## 添加供应商

1. 进入 **模型管理** 页面
2. 点击 **添加供应商** 按钮
3. 选择预设供应商或「自定义」
4. 填写 API Key 和 Base URL（预设供应商已自动填充 Base URL）
5. 点击 **测试连接** 验证配置
6. 保存配置

## 管理模型

### 获取模型列表

配置好供应商后，点击 **获取模型** 按钮，系统会自动从供应商 API 拉取可用模型列表。

### 模型能力

每个模型可以标记以下能力：

- **视觉 (Vision)** - 支持图片输入
- **联网搜索 (Web Search)** - 支持在线搜索
- **推理 (Reasoning)** - 支持推理思考
- **工具调用 (Tool Use)** - 支持函数调用
- **嵌入 (Embedding)** - 支持文本嵌入
- **重排序 (Reranking)** - 支持结果重排序

### 模型配置

每个模型可以独立配置：

- **系统提示词** - 自定义模型的系统消息
- **最大 Token 数** - 单次回复的最大 Token 限制
- **上下文窗口** - 模型的上下文长度
- **启用/停用** - 控制模型是否在聊天中可选

## 切换活跃模型

在聊天界面中，可以通过顶部的模型选择器快速切换当前使用的模型。切换后的对话将使用新选择的模型进行回复。

## 连接测试

每个供应商都支持连接测试功能：

1. 在供应商配置页面点击 **测试连接**
2. 系统会发送测试请求到供应商 API
3. 显示连接状态和响应延迟
4. 帮助排查 API Key 或网络配置问题

## 本地模型

对于 Ollama 和 LM Studio 等本地模型服务，无需 API Key，只需确保本地服务已启动：

- **Ollama**: 默认地址 `http://localhost:11434/v1`
- **LM Studio**: 默认地址 `http://localhost:1234/v1`
