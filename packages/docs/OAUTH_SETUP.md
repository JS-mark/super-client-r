# OAuth 登录配置指南

Super Client 支持 Google 和 GitHub OAuth 登录。本文档说明如何配置 OAuth 凭据。

## Google OAuth 配置

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择已有项目
3. 进入 **APIs & Services** → **Credentials**（API 和服务 → 凭据）
4. 点击 **Create Credentials** → **OAuth client ID**（创建凭据 → OAuth 客户端 ID）
5. 如果系统提示，请先配置 OAuth 同意屏幕：
   - 用户类型：**External**（外部）（Google Workspace 用户可选 Internal）
   - 填写必要的应用信息
   - 添加权限范围：`openid`、`email`、`profile`
6. 返回凭据页面，创建 OAuth 客户端 ID：
   - 应用类型：**Desktop app**（桌面应用）
   - 名称：`Super Client`（或任意名称）
7. 点击 **Create**（创建）
8. 复制 **Client ID**（客户端 ID）
   - 无需客户端密钥 — Super Client 使用 PKCE（Proof Key for Code Exchange）流程，对桌面应用更安全
9. 在 Super Client 中：**设置** → **API Keys** → 粘贴 Google Client ID → **保存**

### 说明

- 重定向 URI 为 `https://app.nexo-ai.top/auth/callback` — 该地址会被 BrowserWindow 拦截，不会实际加载
- Google PKCE 流程不需要客户端密钥，适合桌面应用的安全需求
- 请求的权限范围：`openid`、`email`、`profile`

## GitHub OAuth 配置

1. 前往 [GitHub Developer Settings](https://github.com/settings/developers)（开发者设置）
2. 点击 **New OAuth App**（新建 OAuth 应用）
3. 填写应用信息：
   - **Application name**（应用名称）：`Super Client`
   - **Homepage URL**（主页地址）：`https://app.nexo-ai.top/`
   - **Authorization callback URL**（授权回调地址）：`https://app.nexo-ai.top/auth/callback`
4. 点击 **Register application**（注册应用）
5. 复制 **Client ID**（客户端 ID）
6. 点击 **Generate a new client ***（生成新的客户端密钥）并复制
7. 在 Super Client 中：**设置** → **API Keys** → 粘贴 Client ID 和客户端密钥 → **保存**

### 说明

- GitHub OAuth 需要 Client ID 和客户端密钥（与 Google 的 PKCE 流程不同）
- 客户端密钥存储在本地 electron-store 配置中
- 请求的权限范围：`read:user`、`user:email`

## 工作原理

1. 在登录页面点击「使用 Google/GitHub 登录」时，会打开一个 BrowserWindow 显示 OAuth 授权页面
2. 在浏览器中完成授权
3. OAuth 提供商重定向到 `https://app.nexo-ai.top/auth/callback` 并携带授权码
4. BrowserWindow 拦截此重定向（在实际加载之前）
5. 主进程用授权码换取访问令牌
6. 使用访问令牌获取用户资料信息
7. 用户数据和令牌存储在本地 electron-store 中
8. 授权窗口关闭，登录完成

## 常见问题

### "Google Client ID not configured"（Google 客户端 ID 未配置）
→ 前往 设置 → API Keys，输入 Google Client ID

### "GitHub OAuth credentials not configured"（GitHub OAuth 凭据未配置）
→ 前往 设置 → API Keys，输入 GitHub Client ID 和客户端密钥

### OAuth 窗口打开后没有反应
→ 检查 OAuth 应用的回调地址是否设置为 `https://app.nexo-ai.top/auth/callback`

### "OAuth state mismatch"（OAuth 状态不匹配）
→ 这是防止 CSRF 攻击的安全检查，请重新尝试登录

### "Failed to exchange authorization code"（授权码交换失败）
→ 请检查凭据是否正确，以及 OAuth 应用是否配置正确
