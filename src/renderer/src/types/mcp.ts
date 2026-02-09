export interface McpServer {
	id: string;
	name: string;
	url?: string;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	status: "connected" | "disconnected" | "error";
	capabilities?: string[];
	version?: string;
	enabled?: boolean;
	tools?: import("./electron").McpTool[];
	error?: string;
}
