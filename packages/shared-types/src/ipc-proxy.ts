/**
 * Typed IPC Proxy 类型工具
 *
 * 用于定义跨进程通信的类型契约
 */

/**
 * 标记一个属性为事件监听器
 *
 * 用法：
 *   onStreamEvent: Listener<AgentSDKStreamEvent>
 *
 * Preload 桥接时自动转为 ipcRenderer.on()
 * 返回值是取消监听的函数
 */
export type Listener<T> = (callback: (data: T) => void) => () => void;

/**
 * IPC 响应包装类型（保持向后兼容）
 */
export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}
