/**
 * IPC 通用类型定义
 */

/** IPC 请求包装类型 */
export interface IPCRequest<T = unknown> {
	id?: string;
	payload?: T;
}

/** IPC 响应包装类型 */
export interface IPCResponse<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/** IPC 流式数据类型 */
export interface IPCStreamData<T = unknown> {
	type: string;
	data: T;
}
