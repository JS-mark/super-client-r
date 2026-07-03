/**
 * 共享类型定义
 *
 * 此包包含在主进程和渲染进程之间共享的类型定义，
 * 避免手动同步维护两份类型文件。
 *
 * @packageDocumentation
 */

// ============ Agent 相关类型 ============
export * from "./agent";

// ============ Agent SDK 相关类型 ============
export * from "./agent-sdk";

// ============ Agent Runtime 适配层（spec: 2026-06-21-agent-runtime-adapter-design）============
export * from "./agent-runtime";

// ============ Agent Trace 调试 / 追踪 ============
export * from "./agent-trace";

// ============ Agent Product Events (spec: 2026-06-27-agent-runtime-product-events) ============
export * from "./agent-product-events";

// ============ Plan / Execute 契约 ============
export * from "./plan-execute";

// ============ Multi-Agent Subagent 类型 (Phase 4 Round 6) ============
export * from "./subagent";

// ============ Skill 相关类型 ============
export * from "./skill";

// ============ MCP 相关类型 ============
export * from "./mcp";

// ============ Chat 相关类型 ============
export * from "./chat";

// ============ IPC 通用类型 ============
export * from "./ipc";

// ============ Remote Protocol 类型 ============
export * from "./remote-protocol";

// ============ Extension Descriptor 类型 ============
export * from "./extensions";

// ============ Git 分支信息类型 ============
export * from "./git";

// ============ Project / Session 重设计（project-session-redesign A-1） ============
export * from "./project";

// ============ Message ⇄ SessionEvent converter ============
export * from "./messageConverter";

// ============ ElectronAPI 共享契约 ============
export * from "./electron-api";
