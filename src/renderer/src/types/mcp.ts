export interface McpServer {
	id: string;
	name: string;
	url: string;
	status: "connected" | "disconnected" | "error";
	capabilities: string[];
	version?: string;
}
