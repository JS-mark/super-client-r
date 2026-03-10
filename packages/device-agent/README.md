# Device Agent

将远程设备连接到 Super Client R 的独立客户端。

## 下载

前往 [GitHub Releases](https://github.com/JS-mark/super-client-r/releases) 下载对应平台的可执行文件：

| 平台                | 文件名                         |
|---------------------|--------------------------------|
| Linux x64           | `device-agent-linux-x64`       |
| Linux arm64         | `device-agent-linux-arm64`     |
| macOS Intel         | `device-agent-macos-x64`       |
| macOS Apple Silicon | `device-agent-macos-arm64`     |
| Windows x64         | `device-agent-windows-x64.exe` |

**无需安装 Node.js**，下载即可运行。

## 快速开始

### 1. 在应用中注册设备

在 Super Client R 的 "Remote Device" 页面中：

1. 点击 "注册新设备"
2. 填写设备名称、平台等信息
3. 确认后会生成 Token，**复制并保存**

### 2. 运行

**Linux / macOS:**

```bash
# 添加执行权限（首次运行需要）
chmod +x ./device-agent-linux-x64

# 运行
DEVICE_ID=my-device \
DEVICE_TOKEN=你的Token \
SERVER_URL=ws://your-host:8088 \
./device-agent-linux-x64
```

**Windows (PowerShell):**

```powershell
$env:DEVICE_ID="my-device"
$env:DEVICE_TOKEN="你的Token"
$env:SERVER_URL="ws://your-host:8088"
.\device-agent-windows-x64.exe
```

**Windows (CMD):**

```cmd
set DEVICE_ID=my-device
set DEVICE_TOKEN=你的Token
set SERVER_URL=ws://your-host:8088
device-agent-windows-x64.exe
```

### 3. 配置参数

| 环境变量       | 说明                   | 默认值              |
|----------------|------------------------|---------------------|
| `DEVICE_ID`    | 设备 ID（注册时生成）    | device-001          |
| `DEVICE_TOKEN` | 认证 Token（注册时生成） | （必须提供）          |
| `SERVER_URL`   | WebSocket 服务器地址   | ws://localhost:8088 |

## 通过 IM 机器人控制设备

设备连接后，可在 Telegram 中使用：

```bash
/device list                    # 查看所有设备
/device status my-device        # 查看设备状态
/exec my-device "ls -la"        # 执行命令
/exec my-device "uptime"        # 查看运行时间
```

## 后台运行

### Linux systemd

创建 `/etc/systemd/system/device-agent.service`：

```ini
[Unit]
Description=Device Agent for Super Client R
After=network.target

[Service]
Type=simple
User=your-user
Environment="DEVICE_ID=your-device-id"
Environment="DEVICE_TOKEN=your-token"
Environment="SERVER_URL=ws://your-host:8088"
ExecStart=/path/to/device-agent-linux-x64
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable device-agent
sudo systemctl start device-agent
```

### macOS launchd

创建 `~/Library/LaunchAgents/com.super-client.device-agent.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.super-client.device-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/device-agent-macos-arm64</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DEVICE_ID</key>
        <string>your-device-id</string>
        <key>DEVICE_TOKEN</key>
        <string>your-token</string>
        <key>SERVER_URL</key>
        <string>ws://your-host:8088</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.super-client.device-agent.plist
```

## 从源码构建

Device Agent 位于 `packages/device-agent/`，使用 Bun 编译为独立二进制。

```bash
# 编译当前平台
pnpm agent:build

# 编译全部平台
pnpm agent:build:all

# 产物在 packages/device-agent/dist/
ls packages/device-agent/dist/
# device-agent-linux-x64
# device-agent-linux-arm64
# device-agent-macos-x64
# device-agent-macos-arm64
# device-agent-windows-x64.exe
```

### 中继模式（跨网络访问）

如果 Electron 应用和设备不在同一网络，需要通过 Relay Server 中转：

```bash
DEVICE_ID=my-device \
DEVICE_TOKEN=你的Token \
SERVER_URL=wss://relay.example.com:443 \
RELAY_KEY=your-relay-key \
./device-agent-linux-x64
```

详见 [Relay Server 文档](../features/relay-server.md)。

## 安全注意事项

1. **Token 保密** — Token 具有完全的设备控制权限，请妥善保管
2. **网络安全** — 生产环境建议使用 WSS（加密 WebSocket）
3. **命令权限** — Agent 可执行任何系统命令，请谨慎使用
4. **防火墙** — 确保设备可以访问服务器的 8088 端口

## 故障排除

| 问题               | 排查                                                        |
|--------------------|-------------------------------------------------------------|
| 无法连接           | 检查网络、确认 SERVER_URL 正确、检查防火墙                    |
| 认证失败           | 确认 DEVICE_TOKEN 和 DEVICE_ID 正确                         |
| 命令执行失败       | 检查命令语法、确认设备有执行权限                             |
| macOS 提示无法打开 | 运行 `xattr -d com.apple.quarantine ./device-agent-macos-*` |
