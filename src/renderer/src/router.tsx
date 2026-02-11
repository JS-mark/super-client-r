import { createHashRouter } from "react-router-dom";
import Bookmarks from "./pages/Bookmarks";
import Chat from "./pages/Chat";
import ErrorPage from "./pages/Error";
import FloatWidget from "./pages/FloatWidget";
import Login from "./pages/Login";
import McpMarket from "./pages/McpMarket";
import Models from "./pages/Models";
import Plugins from "./pages/Plugins";
import Settings from "./pages/Settings";
import Skills from "./pages/Skills";
import Workspaces from "./pages/Workspaces";

export const router = createHashRouter([
	{
		path: "/float",
		element: <FloatWidget />,
		errorElement: <ErrorPage />,
		handle: { title: "浮动组件" },
	},
	{
		path: "/",
		element: <Login />,
		errorElement: <ErrorPage />,
		handle: { title: "登录" },
	},
	{
		path: "/chat",
		element: <Chat />,
		errorElement: <ErrorPage />,
		handle: { title: "AI 聊天" },
	},
	{
		path: "/models",
		element: <Models />,
		errorElement: <ErrorPage />,
		handle: { title: "模型管理" },
	},
	{
		path: "/skills",
		element: <Skills />,
		errorElement: <ErrorPage />,
		handle: { title: "技能市场" },
	},
	{
		path: "/mcp",
		element: <McpMarket />,
		errorElement: <ErrorPage />,
		handle: { title: "MCP 市场" },
	},
	{
		path: "/plugins",
		element: <Plugins />,
		errorElement: <ErrorPage />,
		handle: { title: "插件中心" },
	},
	{
		path: "/bookmarks",
		element: <Bookmarks />,
		errorElement: <ErrorPage />,
		handle: { title: "收藏" },
	},
	{
		path: "/workspaces",
		element: <Workspaces />,
		errorElement: <ErrorPage />,
		handle: { title: "工作区" },
	},
	{
		path: "/settings",
		element: <Settings />,
		errorElement: <ErrorPage />,
		handle: { title: "设置" },
	},
]);
