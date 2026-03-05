# 联网搜索

Super Client R 内置联网搜索功能，支持 10 种搜索引擎，让 AI 能够获取实时互联网信息来回答问题。

## 支持的搜索引擎

| 引擎 | 说明 | 类型 | 需要 API Key |
|------|------|------|:------------:|
| 智谱 AI | 智谱 AI 搜索 API | API 搜索 | 是 |
| Tavily | Tavily AI 搜索引擎 | API 搜索 | 是 |
| SearXNG | 自建 SearXNG 搜索服务 | API 搜索 | 否（可选） |
| Exa | Exa AI 搜索引擎 | API 搜索 | 是 |
| Exa MCP | Exa MCP Server 集成 | API 搜索 | 是 |
| 博查 (Bocha) | 博查 AI 搜索引擎 | API 搜索 | 是 |
| 搜狗 | 搜狗搜索 API | API 搜索 | 是 |
| Google | Google 自定义搜索 | 传统搜索 | 是 |
| Bing | 必应搜索 API | 传统搜索 | 是 |
| 百度 | 百度搜索 API | 传统搜索 | 是 |

## 配置搜索引擎

### 添加搜索引擎

1. 进入 **设置** > **搜索设置**
2. 点击 **添加搜索引擎**
3. 选择搜索引擎类型
4. 填写所需的 API Key 或 API 地址
5. 保存配置

### SearXNG 自建服务

SearXNG 是一个免费的自托管搜索引擎聚合器，不需要 API Key：

1. 部署 SearXNG 服务（参考 [SearXNG 文档](https://docs.searxng.org/)）
2. 在配置中填写 API 地址，例如 `http://localhost:8080`
3. 如有访问限制，可选填 API Key

### Google 自定义搜索

1. 在 [Google Custom Search](https://developers.google.com/custom-search) 创建自定义搜索引擎
2. 获取 API Key 和 CX ID
3. 在配置中填入相关信息

## 在聊天中使用

配置好搜索引擎后，AI 在对话中会自动判断是否需要联网搜索。你也可以明确要求 AI 搜索特定内容：

- 「帮我搜索最新的 xxx 新闻」
- 「查一下 xxx 的最新信息」

搜索结果会包含标题、URL 和摘要，AI 会基于这些信息生成回复。

## 管理搜索配置

- **启用/停用** - 可以单独启用或停用每个搜索引擎
- **设置默认引擎** - 选择一个作为默认搜索引擎
- **测试连接** - 验证搜索引擎配置是否正确
- **编辑/删除** - 随时修改或移除搜索配置
