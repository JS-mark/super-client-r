/**
 * Internal MCP 服务器类型定义
 */

export interface InternalToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface InternalToolResult {
	content: Array<
		| { type: "text"; text: string }
		| { type: "image"; data: string; mimeType: string }
	>;
	isError?: boolean;
}

export type InternalToolHandler = (
	args: Record<string, unknown>,
) => Promise<InternalToolResult>;

export interface InternalMcpServer {
	id: string;
	name: string;
	description: string;
	version: string;
	tools: InternalToolDefinition[];
	handlers: Map<string, InternalToolHandler>;
	initialize?: () => Promise<void>;
	cleanup?: () => Promise<void>;
}
