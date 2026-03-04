# Remote Chat Bridge（远程聊天桥接）

Remote Chat Bridge 可以将 Chat 页面的 AI 对话与 IM Bot（Telegram / 钉钉 / 飞书）进行**双向桥接**，实现跨平台的智能对话能力。

## 功能概述

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                   Super Client R (Chat 页面)                     │
  │                                                                 │
  │  用户发消息 ──► AI 回复 ──► 自动转发到 IM ──►  Telegram / 钉钉  │
  │                                                   / 飞书 群组   │
  │  IM 来消息 ◄── AI 自动回复 ◄── 消息出现在 Chat ◄──             │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
```

### 两条数据流

**Flow 1：用户 → AI → IM**

```
Chat.tsx 发消息 → LLM 流式回复 → 回复完成
                                     │
                                     ▼
                              检查会话绑定？
                                     │ 是
                                     ▼
                           forwardToBot() → IM 平台
```

**Flow 2：IM → Chat → AI → IM**

```
IM 平台收到消息 → IMBotService.emit("raw-message")
                         │
                         ▼
                  RemoteChatBridge 匹配绑定
                         │
                         ▼
               webContents.send("im-message")
                         │
                         ▼
              useRemoteChat 监听 → addMessage → sendMessage
                         │
                         ▼
                    (进入 Flow 1)
```

## 前置条件

1. **配置 AI 模型** — 在 "设置 → 模型" 中至少启用一个模型
2. **创建并启动 IM Bot** — 在 IM Bot 页面配置并启动一个 Bot

### 平台官方文档

在创建 Bot 之前，你需要在对应平台注册开发者账号并获取 API 凭证：

| 平台 | 开发者文档 | 获取凭证 |
|------|-----------|---------|
| **Telegram** | [Telegram Bot API](https://core.telegram.org/bots/api) | 通过 [@BotFather](https://t.me/BotFather) 创建 Bot 并获取 Token |
| **钉钉** | [钉钉开放平台 - 机器人开发](https://open.dingtalk.com/document/orgapp/robot-overview) | 在 [钉钉开发者后台](https://open-dev.dingtalk.com/) 创建应用获取 AppKey/AppSecret |
| **飞书** | [飞书开放平台 - 机器人开发](https://open.feishu.cn/document/client-docs/bot-v3/bot-overview) | 在 [飞书开发者后台](https://open.feishu.cn/app) 创建应用获取 App ID/App Secret |

## 操作步骤

### 第 1 步：启动 IM Bot

1. 在左侧菜单点击进入 **IM Bot** 页面
2. 点击 **"添加机器人"** 按钮
3. 填写 Bot 配置：

#### Telegram

| 字段 | 必填 | 说明 |
|------|------|------|
| Bot 名称 | 是 | 自定义标识名 |
| Bot Token | 是 | 从 [@BotFather](https://t.me/BotFather) 获取（格式: `123456:ABC-DEF...`） |
| Chat ID | 否 | 广播用默认聊天 ID |

> **如何获取 Telegram Chat ID?**
>
> 1. 将 Bot 添加到目标群组
> 2. 在群组中发送一条消息
> 3. 访问 `https://api.telegram.org/bot<TOKEN>/getUpdates`
> 4. 在返回的 JSON 中找到 `chat.id` 字段（群组为负数，如 `-1001234567890`）
>
> 或使用 [@userinfobot](https://t.me/userinfobot) / [@RawDataBot](https://t.me/RawDataBot) 获取。

#### 钉钉

| 字段 | 必填 | 说明 |
|------|------|------|
| Bot 名称 | 是 | 自定义标识名 |
| AppKey | 是 | [钉钉开发者后台](https://open-dev.dingtalk.com/) → 应用凭证 |
| AppSecret | 是 | 同上 |
| Webhook URL | 否 | 自定义机器人 Webhook 地址 |

> **如何获取钉钉会话 ID?**
>
> 钉钉的 `conversationId` 可通过机器人接收消息时的回调数据中获取。
> 参考文档：[钉钉 - 接收消息](https://open.dingtalk.com/document/orgapp/receive-message)

#### 飞书

| 字段 | 必填 | 说明 |
|------|------|------|
| Bot 名称 | 是 | 自定义标识名 |
| App ID | 是 | [飞书开发者后台](https://open.feishu.cn/app) → 凭证与基础信息 |
| App Secret | 是 | 同上 |
| Verification Token | 否 | 事件订阅验证 |
| Encrypt Key | 否 | 事件订阅加密 |
| Chat IDs | 否 | 广播目标群组，逗号分隔 |

> **如何获取飞书 Chat ID?**
>
> 飞书 Chat ID 以 `oc_` 开头，可通过以下方式获取：
> 1. 调用 [获取群列表 API](https://open.feishu.cn/document/server-docs/group/chat/list)
> 2. 或在机器人接收消息的事件回调中提取 `chat_id` 字段
>
> 参考文档：[飞书 - 获取群信息](https://open.feishu.cn/document/server-docs/group/chat/get)

4. 点击 **"启动"**，确认状态变为绿色 **"运行中"**

### 第 2 步：绑定 Bot 到 Chat 会话

1. 切换到 **Chat 页面**
2. 创建一个新会话，或选择一个已有会话
3. 点击顶部标题栏右侧的 **🔗 绑定 Bot** 按钮（ApiOutlined 图标）

```
 ┌──────────────────────────────────────────────────────────┐
 │  🤖 AI 聊天        [🔗] [🔍] [📤] [🗑️] [+] [📋] [⚙️]  │
 │                     ↑                                    │
 │               点击此按钮                                  │
 └──────────────────────────────────────────────────────────┘
```

4. 在弹窗中：
   - **选择 Bot** — 下拉列表只显示运行中的 Bot
   - 确认状态指示器为绿色 ✅ **"在线"**
   - **输入 Chat ID** — 填入目标聊天/群组 ID（参考上方各平台的获取方式）
   - 点击 **"绑定"**

5. 绑定成功后，标题栏出现彩色标签：

```
 ┌──────────────────────────────────────────────────────────┐
 │  🤖 AI 聊天   [TG · MyBot ✕]  [🔍] [📤] [🗑️] [+] [📋] │
 │                ↑ 远程绑定标签                              │
 └──────────────────────────────────────────────────────────┘
```

### 第 3 步：开始双向对话

绑定完成后，即可自动工作：

| 操作 | 效果 |
|------|------|
| 在 Chat 中发消息 | AI 回复后，回复内容自动转发到 IM 端 |
| 在 IM 端发消息 | 消息出现在 Chat 中（带来源标识），AI 自动回复并转发回 IM |

**识别远程消息**：来自 IM 的消息在 Chat 中会有特殊标识：

```
                              ┌─────────────────────────┐
                              │ [🔗 张三]    张三    👤  │  ← 远程消息标识
                              │   10:30 AM              │
                              ├─────────────────────────┤
                              │ 请帮我总结一下今天的会议  │
                              └─────────────────────────┘
  ┌─────────────────────────┐
  │ 🤖  AI                  │  ← AI 自动回复
  │     10:30 AM            │     （同时转发到 IM）
  ├─────────────────────────┤
  │ 好的，以下是今天的会议   │
  │ 总结...                 │
  └─────────────────────────┘
```

### 解绑

点击标题栏远程标签上的 **✕** 按钮 → 确认 **"解绑"** 即可。

解绑后，Chat 和 IM 不再互通，但历史消息保留。

## 侧边栏标识

绑定了 Bot 的会话在会话列表中会显示一个 🔗 图标，方便快速识别：

```
 ┌──────────────────────────┐
 │ 📋 会话历史               │
 ├──────────────────────────┤
 │ 🔗 项目讨论群桥接    2分钟 │  ← 已绑定
 │    请帮我总结...          │
 ├──────────────────────────┤
 │   日常对话           1小时 │  ← 普通会话
 │    你好...               │
 └──────────────────────────┘
```

## 边界情况

| 场景 | 行为 |
|------|------|
| Bot 离线时尝试绑定 | 弹窗显示"离线"状态，绑定按钮不可用 |
| 转发失败（Bot 意外掉线） | 聊天不中断，控制台输出警告日志 |
| AI 正在回复时收到 IM 消息 | 消息排队，等 AI 空闲后自动处理 |
| 同一 (Bot + ChatID) 已绑定其他会话 | 阻止绑定，提示"已被其他会话占用" |
| 消息超过平台长度限制 | 自动分段发送（Telegram 4096 / 钉钉 20000 / 飞书 30000 字符） |
| 删除已绑定的会话 | 绑定信息随会话数据一起清除 |
| 不在绑定会话页面时收到 IM 消息 | 当前版本不处理（未来可扩展通知功能） |
| IM 端发送命令消息（以 `/` 开头） | 走 IM Bot 命令系统，不转发到 Chat |

## 技术架构

详细的技术实现请参考源代码：

| 文件 | 说明 |
|------|------|
| `src/main/services/remote-chat/RemoteChatBridge.ts` | 核心桥接服务 |
| `src/main/ipc/handlers/remoteChatHandlers.ts` | IPC 处理器 |
| `src/renderer/src/hooks/useRemoteChat.ts` | 渲染层 Hook |
| `src/renderer/src/components/chat/RemoteBindingModal.tsx` | 绑定弹窗组件 |
| `src/renderer/src/components/chat/RemoteBadge.tsx` | 状态徽标组件 |

## 相关文档

- [AI 聊天](./chat.md) — Chat 页面基础功能
- [MCP 工具](./mcp.md) — 工具调用能力（绑定后 AI 依然可以调用工具）
- [技能系统](./skills.md) — Skill 模式配合远程桥接
