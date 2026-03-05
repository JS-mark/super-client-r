/**
 * WebSocket Relay Server
 *
 * 轻量级中继服务器，让 Electron 主应用（controller）和 Device-Agent（device）
 * 都作为客户端连接到公网 relay，实现内网穿透。
 *
 * 协议:
 * - 连接后 10s 内必须发 relay_auth 消息
 * - relay_auth 按 role (controller/device) + relayKey 分房间
 * - 消息透传: device→controller / controller→按 deviceId 路由到 device
 *
 * 编译: bun run relay-server/build.ts
 * 运行: PORT=9099 RELAY_KEYS=key1,key2 ./relay-server
 */

interface RelayAuthMessage {
  type: "relay_auth";
  role: "controller" | "device";
  relayKey: string;
  deviceId?: string; // device 角色必填
}

interface Room {
  controller: ServerWebSocket | null;
  devices: Map<string, ServerWebSocket>; // deviceId → ws
}

type ServerWebSocket = import("bun").ServerWebSocket<WSData>;

interface WSData {
  role?: "controller" | "device";
  relayKey?: string;
  deviceId?: string;
  authTimer?: ReturnType<typeof setTimeout>;
}

// 配置
const PORT = Number(process.env.PORT) || 9099;
const ALLOWED_KEYS = process.env.RELAY_KEYS
  ? new Set(process.env.RELAY_KEYS.split(",").map((k) => k.trim()))
  : null; // null = 不限制

// 房间管理
const rooms = new Map<string, Room>();

function getOrCreateRoom(relayKey: string): Room {
  let room = rooms.get(relayKey);
  if (!room) {
    room = { controller: null, devices: new Map() };
    rooms.set(relayKey, room);
  }
  return room;
}

function cleanupRoom(relayKey: string): void {
  const room = rooms.get(relayKey);
  if (room && !room.controller && room.devices.size === 0) {
    rooms.delete(relayKey);
  }
}

function handleAuth(ws: ServerWebSocket, msg: RelayAuthMessage): void {
  const { role, relayKey, deviceId } = msg;

  // 清除认证超时
  if (ws.data.authTimer) {
    clearTimeout(ws.data.authTimer);
    ws.data.authTimer = undefined;
  }

  // 验证 relayKey
  if (ALLOWED_KEYS && !ALLOWED_KEYS.has(relayKey)) {
    ws.send(
      JSON.stringify({
        type: "relay_auth_ack",
        success: false,
        error: "Invalid relay key",
      }),
    );
    ws.close(4003, "Invalid relay key");
    return;
  }

  const room = getOrCreateRoom(relayKey);

  if (role === "controller") {
    // 踢掉旧 controller
    if (room.controller && room.controller !== ws) {
      room.controller.close(4002, "Replaced by new controller");
    }
    room.controller = ws;
    ws.data.role = "controller";
    ws.data.relayKey = relayKey;

    ws.send(
      JSON.stringify({
        type: "relay_auth_ack",
        success: true,
        role: "controller",
      }),
    );
    console.log(`[Relay] Controller joined room "${relayKey}"`);
  } else if (role === "device") {
    if (!deviceId) {
      ws.send(
        JSON.stringify({
          type: "relay_auth_ack",
          success: false,
          error: "deviceId required for device role",
        }),
      );
      ws.close(4001, "Missing deviceId");
      return;
    }

    // 踢掉同 deviceId 的旧连接
    const existing = room.devices.get(deviceId);
    if (existing && existing !== ws) {
      existing.close(4002, "Replaced by new device connection");
    }

    room.devices.set(deviceId, ws);
    ws.data.role = "device";
    ws.data.relayKey = relayKey;
    ws.data.deviceId = deviceId;

    ws.send(
      JSON.stringify({
        type: "relay_auth_ack",
        success: true,
        role: "device",
      }),
    );
    console.log(
      `[Relay] Device "${deviceId}" joined room "${relayKey}"`,
    );
  } else {
    ws.close(4001, "Invalid role");
  }
}

function handleMessage(ws: ServerWebSocket, raw: string): void {
  const { role, relayKey } = ws.data;

  if (!role || !relayKey) {
    // 未认证，尝试解析为 relay_auth
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "relay_auth") {
        handleAuth(ws, msg as RelayAuthMessage);
        return;
      }
    } catch {
      // ignore
    }
    ws.close(4001, "Not authenticated");
    return;
  }

  const room = rooms.get(relayKey);
  if (!room) return;

  if (role === "device") {
    // device → controller: 透传，注入 deviceId
    if (room.controller) {
      try {
        const msg = JSON.parse(raw);
        msg.deviceId = ws.data.deviceId;
        room.controller.send(JSON.stringify(msg));
      } catch {
        // 无法解析则丢弃
      }
    }
  } else if (role === "controller") {
    // controller → device: 按 msg.deviceId 路由
    try {
      const msg = JSON.parse(raw);
      const targetDeviceId = msg.deviceId;
      if (targetDeviceId) {
        const deviceWs = room.devices.get(targetDeviceId);
        if (deviceWs) {
          deviceWs.send(raw);
        }
      }
    } catch {
      // 无法解析则丢弃
    }
  }
}

function handleClose(ws: ServerWebSocket): void {
  const { role, relayKey, deviceId } = ws.data;
  if (!role || !relayKey) return;

  const room = rooms.get(relayKey);
  if (!room) return;

  if (role === "controller" && room.controller === ws) {
    room.controller = null;
    console.log(`[Relay] Controller left room "${relayKey}"`);
  } else if (role === "device" && deviceId) {
    if (room.devices.get(deviceId) === ws) {
      room.devices.delete(deviceId);
      console.log(
        `[Relay] Device "${deviceId}" left room "${relayKey}"`,
      );

      // 通知 controller 设备断开
      if (room.controller) {
        room.controller.send(
          JSON.stringify({
            type: "relay_device_disconnected",
            deviceId,
          }),
        );
      }
    }
  }

  // 清除认证超时
  if (ws.data.authTimer) {
    clearTimeout(ws.data.authTimer);
  }

  cleanupRoom(relayKey);
}

// 启动 Bun WebSocket 服务器
const server = Bun.serve<WSData>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // 健康检查
    if (req.method === "GET" && url.pathname === "/") {
      const totalDevices = Array.from(rooms.values()).reduce(
        (sum, r) => sum + r.devices.size,
        0,
      );
      return new Response(
        JSON.stringify({
          status: "ok",
          rooms: rooms.size,
          devices: totalDevices,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    // WebSocket 升级
    if (server.upgrade(req, { data: {} })) {
      return undefined;
    }

    return new Response("Not Found", { status: 404 });
  },
  websocket: {
    open(ws: ServerWebSocket) {
      // 10s 认证超时
      ws.data.authTimer = setTimeout(() => {
        if (!ws.data.role) {
          ws.close(4001, "Authentication timeout");
        }
      }, 10000);
    },
    message(ws: ServerWebSocket, message: string | Buffer) {
      const raw =
        typeof message === "string" ? message : message.toString();
      handleMessage(ws, raw);
    },
    close(ws: ServerWebSocket) {
      handleClose(ws);
    },
  },
});

console.log(`[Relay] WebSocket Relay Server started on port ${server.port}`);
if (ALLOWED_KEYS) {
  console.log(
    `[Relay] Allowed keys: ${Array.from(ALLOWED_KEYS).join(", ")}`,
  );
} else {
  console.log("[Relay] No key restriction (all keys accepted)");
}
