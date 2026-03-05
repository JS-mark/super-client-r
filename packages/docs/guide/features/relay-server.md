# WebSocket Relay Server（公网中继服务）

Relay Server 是一个轻量级 WebSocket 中继服务器，解决 Electron 主应用在内网时公网设备无法直连的问题。

## 架构

```
┌──── 内网 ──────────────────┐        ┌──── 公网 ────────────────┐
│                            │        │                          │
│  Electron App (controller) │──ws──► │  Cloud Relay Server      │ ◄──ws── Device-Agent (device)
│  192.168.x.x               │        │  relay.example.com:9099  │         任意公网位置
│                            │        │                          │
└────────────────────────────┘        └──────────────────────────┘
```

**核心思路**：双方都作为客户端连接到公网 Relay，Relay 纯消息转发，不解析业务逻辑。

### 与局域网模式对比

| | 局域网模式 (local) | 中继模式 (relay) |
|---|---|---|
| Electron 角色 | WS Server (:8088) | WS Client → Relay |
| Device-Agent 角色 | WS Client → Electron | WS Client → Relay |
| 网络要求 | 同一局域网 | 双方都能访问 Relay 即可 |
| 额外部署 | 无 | 需要一台公网服务器跑 Relay |

## 协议说明

### 连接流程

```
                     Relay Server
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
 Controller          WebSocket           Device-Agent
      │                   │                   │
      ├── connect ────────►                   │
      ├── relay_auth ─────► 验证 relayKey     │
      │◄─ relay_auth_ack ─┤ role=controller   │
      │                   │                   ├── connect
      │                   │    验证 relayKey ◄─┤── relay_auth
      │                   │   role=device ────►├── relay_auth_ack
      │                   │                   ├── register (设备注册)
      │◄── register ──────┤◄── 透传 ──────────┤
      ├── register_ack ──►├── 透传 ──────────►│
      │                   │                   │
      │   .... 后续所有消息透传 ....            │
      │                   │                   │
      │◄── command_result ┤◄── 透传 ──────────┤
```

### relay_auth 消息格式

连接后 **10 秒内**必须发送认证消息，否则 Relay 主动关闭连接。

**Controller 端：**
```json
{
  "type": "relay_auth",
  "role": "controller",
  "relayKey": "my-secret-key"
}
```

**Device 端：**
```json
{
  "type": "relay_auth",
  "role": "device",
  "relayKey": "my-secret-key",
  "deviceId": "device-001"
}
```

**认证响应：**
```json
{
  "type": "relay_auth_ack",
  "success": true,
  "role": "controller"
}
```

### 消息转发规则

| 方向 | 行为 |
|------|------|
| device → relay | 注入 `deviceId`，转发给同房间 controller |
| controller → relay | 按消息中的 `deviceId` 路由到对应 device |
| device 断开 | relay 发 `relay_device_disconnected` 通知 controller |

### 房间机制

- 按 `relayKey` 分组，每个 key 是一个独立房间
- 每个房间最多 1 个 controller，多个 device
- 新 controller 连入会踢掉旧 controller
- 同一 `deviceId` 重连会踢掉旧连接
- 房间内无人时自动清理

## 部署 Relay Server

Relay Server 位于 `packages/relay-server/`，使用 Bun 编译为独立二进制。

### 构建

```bash
# 编译当前平台
pnpm relay:build

# 编译所有平台
pnpm relay:build:all

# 产物在 packages/relay-server/dist/ 目录
ls packages/relay-server/dist/
# relay-server-linux-x64
# relay-server-linux-arm64
# relay-server-macos-x64
# relay-server-macos-arm64
# relay-server-windows-x64.exe
```

### 方式一：直接运行（开发/测试）

```bash
# 使用 pnpm 运行
pnpm relay:start

# 或进入目录使用 bun
cd packages/relay-server
PORT=9099 RELAY_KEYS=my-secret-key bun index.ts
```

### 方式二：编译部署（推荐生产环境）

```bash
# 构建
pnpm relay:build:all

# 上传到服务器
scp packages/relay-server/dist/relay-server-linux-x64 user@your-server:/opt/relay-server/

# 在服务器上运行
chmod +x /opt/relay-server/relay-server-linux-x64
PORT=9099 RELAY_KEYS=my-secret-key /opt/relay-server/relay-server-linux-x64
```

### 方式三：Docker 部署

```dockerfile
# Dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY packages/relay-server/index.ts .
EXPOSE 9099
CMD ["bun", "index.ts"]
```

```bash
docker build -t relay-server .
docker run -d \
  --name relay-server \
  -p 9099:9099 \
  -e PORT=9099 \
  -e RELAY_KEYS=my-secret-key \
  --restart unless-stopped \
  relay-server
```

### 方式四：systemd 服务（Linux 生产推荐）

```ini
# /etc/systemd/system/relay-server.service
[Unit]
Description=WebSocket Relay Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/relay-server/relay-server-linux-x64
Environment=PORT=9099
Environment=RELAY_KEYS=my-secret-key
Restart=always
RestartSec=5
User=relay

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable relay-server
sudo systemctl start relay-server
sudo journalctl -u relay-server -f  # 查看日志
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `9099` | 监听端口 |
| `RELAY_KEYS` | (不限制) | 允许的 relay key 列表，逗号分隔。不设置则接受任意 key |

## TLS/WSS 配置

Relay Server 自身只监听 `ws://`。生产环境需要通过反向代理提供 `wss://`。

### Nginx 配置

```nginx
server {
    listen 443 ssl;
    server_name relay.example.com;

    ssl_certificate     /etc/letsencrypt/live/relay.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/relay.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9099;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

### Caddy 配置（自动 HTTPS）

```
relay.example.com {
    reverse_proxy localhost:9099
}
```

## 客户端配置

### 1. Electron 应用端

在**远程控制**页面的设备连接信息中：

1. 将「连接模式」从 **局域网** 切换到 **中继**
2. 填入 Relay 服务器地址：`wss://relay.example.com:443`（或 `ws://ip:9099`）
3. 填入 Relay Key：与 Relay Server 的 `RELAY_KEYS` 一致
4. 点击「保存并应用」

切换后 Electron 会关闭本地 WS Server，改为以 controller 身份连接到 Relay。

### 2. Device-Agent 端

启动命令增加 `RELAY_KEY` 环境变量，`SERVER_URL` 指向 Relay 地址：

```bash
DEVICE_ID=my-device \
DEVICE_TOKEN=<token> \
SERVER_URL=wss://relay.example.com:443 \
RELAY_KEY=my-secret-key \
./device-agent-linux-x64
```

> Device-Agent 检测到 `RELAY_KEY` 非空时，会先向 Relay 发送 `relay_auth` 认证，认证成功后再执行正常的设备注册流程。

## 健康检查

```bash
curl http://relay.example.com:9099/
# {"status":"ok","rooms":1,"devices":2}
```

返回当前活跃房间数和设备总数。

## 安全建议

1. **始终设置 RELAY_KEYS**：生产环境务必配置允许的 key 列表，防止未授权使用
2. **使用 WSS**：通过 Nginx/Caddy 加 TLS，防止中间人窃取 token
3. **Key 轮换**：定期更换 relayKey，在 Relay Server 和两端同时更新
4. **防火墙**：Relay 服务器只需开放 Nginx 的 443 端口，9099 仅监听 127.0.0.1
5. **设备 Token 仍然生效**：Relay 只做转发，设备注册的 token 验证仍在 Electron 主应用完成

## 故障排查

| 问题 | 排查步骤 |
|------|----------|
| 连不上 Relay | 检查 `curl http://relay:9099/` 是否返回健康检查 |
| 认证失败 | 检查 `RELAY_KEYS` 是否包含你使用的 key |
| 设备注册失败 | Relay 认证成功但注册失败 → token 不对，检查 Electron 中注册的设备 token |
| 断线不重连 | 查看 Electron 日志和 Agent 日志，双方都有 5s 自动重连机制 |
| 命令无响应 | 确认 device 在线（健康检查 devices > 0），检查 deviceId 是否匹配 |
| 局域网模式不工作了 | 切换到中继后本地 WS Server 会关闭，需要切回局域网模式才能直连 |

## 完整端到端示例

```bash
# ① 在公网服务器上启动 Relay
PORT=9099 RELAY_KEYS=demo-key-123 ./relay-server-linux-x64

# ② 在 Electron 应用中
#    远程控制 → 连接模式 → 中继
#    URL: wss://relay.example.com
#    Key: demo-key-123
#    保存并应用

# ③ 在远程设备上启动 Agent
DEVICE_ID=server-01 \
DEVICE_TOKEN=<从 Electron 复制的 token> \
SERVER_URL=wss://relay.example.com \
RELAY_KEY=demo-key-123 \
./device-agent-linux-x64

# ④ 回到 Electron，设备显示在线，可以执行命令
```
