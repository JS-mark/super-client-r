import { lazy } from "react";
import {
	createHashRouter,
	Navigate,
	type RouteObject,
} from "react-router-dom";
import Bookmarks from "./pages/Bookmarks";
import Chat from "./pages/Chat";
import ErrorPage from "./pages/Error";
import FloatWidget from "./pages/FloatWidget";
import Login from "./pages/Login";
import McpMarket from "./pages/McpMarket";
import Models from "./pages/Models";
import PluginPage from "./pages/PluginPage";
import Plugins from "./pages/Plugins";
import Settings from "./pages/Settings";
import AboutPage from "./pages/settings/AboutPage";
import AdvancedPage from "./pages/settings/AdvancedPage";
import ApiServicePage from "./pages/settings/ApiServicePage";
import GeneralPage from "./pages/settings/GeneralPage";
import KeyboardPage from "./pages/settings/KeyboardPage";
import ModelsPage from "./pages/settings/ModelsPage";
import ProjectRecoveryPage from "./pages/settings/ProjectRecoveryPage";
import ProjectsPage from "./pages/settings/ProjectsPage";
import ThirdPartyApiPage from "./pages/settings/ThirdPartyApiPage";
import ToolsPermissionsPage from "./pages/settings/ToolsPermissionsPage";
import WebhookPage from "./pages/settings/WebhookPage";
import Skills from "./pages/Skills";
import IMBot from "./pages/IMBot";
import { APP_ROUTE_PATHS, APP_ROUTE_TITLES } from "./lib/routeConfig";

const LogViewer = lazy(() => import("./pages/LogViewer"));
const AgentTraces = lazy(() => import("./pages/AgentTraces"));

export const appRoutes: RouteObject[] = [
	{
		path: APP_ROUTE_PATHS.float,
		element: <FloatWidget />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.float },
	},
	{
		path: APP_ROUTE_PATHS.login,
		element: <Login />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.login },
	},
	{
		path: APP_ROUTE_PATHS.chat,
		element: <Chat />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.chat },
	},
	{
		path: APP_ROUTE_PATHS.models,
		element: <Models />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.models },
	},
	{
		path: APP_ROUTE_PATHS.skills,
		element: <Skills />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.skills },
	},
	{
		path: APP_ROUTE_PATHS.mcp,
		element: <McpMarket />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.mcp },
	},
	{
		path: APP_ROUTE_PATHS.plugins,
		element: <Plugins />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.plugins },
	},
	{
		path: APP_ROUTE_PATHS.bookmarks,
		element: <Bookmarks />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.bookmarks },
	},
	{
		path: APP_ROUTE_PATHS.imbot,
		element: <IMBot />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.imbot },
	},
	{
		path: APP_ROUTE_PATHS.settings,
		element: <Settings />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.settings },
		children: [
			{ index: true, element: <Navigate to="general" replace /> },
			{ path: "general", element: <GeneralPage /> },
			{ path: "models", element: <ModelsPage /> },
			{ path: "third-party-api", element: <ThirdPartyApiPage /> },
			{ path: "agent", element: <Navigate to="../third-party-api" replace /> },
			{ path: "tools-permissions", element: <ToolsPermissionsPage /> },
			{ path: "projects", element: <ProjectsPage /> },
			{ path: "project-recovery", element: <ProjectRecoveryPage /> },
			{ path: "keyboard", element: <KeyboardPage /> },
			{ path: "api-service", element: <ApiServicePage /> },
			{ path: "webhook", element: <WebhookPage /> },
			{ path: "advanced", element: <AdvancedPage /> },
			{ path: "about", element: <AboutPage /> },
		],
	},
	{
		path: APP_ROUTE_PATHS.logViewer,
		element: <LogViewer />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.logViewer },
	},
	{
		// AgentRuntime 调用追踪调试页（spec §17）。
		// dev 模式下从菜单进入；prod 仅在开启调试模式时可访问。
		path: APP_ROUTE_PATHS.agentTraces,
		element: <AgentTraces />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.agentTraces },
	},
	{
		path: APP_ROUTE_PATHS.pluginPage,
		element: <PluginPage />,
		errorElement: <ErrorPage />,
		handle: { title: APP_ROUTE_TITLES.pluginPage },
	},
];

export const router = createHashRouter(appRoutes);
