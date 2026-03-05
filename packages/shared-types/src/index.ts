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
