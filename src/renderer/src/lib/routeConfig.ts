export const APP_ROUTE_PATHS = {
	float: "/float",
	login: "/",
	chat: "/chat",
	skills: "/skills",
	mcp: "/mcp",
	plugins: "/plugins",
	bookmarks: "/bookmarks",
	imbot: "/imbot",
	settings: "/settings",
	logViewer: "/log-viewer",
	agentTraces: "/debug/agent-traces",
	pluginPage: "/plugin/:pluginId/*",
} as const;

export const APP_ROUTE_TITLES = {
	float: "浮动组件",
	login: "登录",
	chat: "Agent 工作台",
	skills: "技能市场",
	mcp: "MCP 市场",
	plugins: "插件中心",
	bookmarks: "收藏",
	imbot: "远程控制",
	settings: "设置",
	logViewer: "日志查看器",
	agentTraces: "Agent Traces",
	pluginPage: "插件页面",
} as const;

export const APP_ROUTE_SHELL_ENTRIES = Object.entries(APP_ROUTE_PATHS).map(
	([key, path]) => ({
		key,
		path,
		title: APP_ROUTE_TITLES[key as keyof typeof APP_ROUTE_TITLES],
	}),
);

