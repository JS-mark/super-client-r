import { createHashRouter } from "react-router-dom";
import Chat from "./pages/Chat";
import ErrorPage from "./pages/Error";
import FloatWidget from "./pages/FloatWidget";
import Login from "./pages/Login";
import Models from "./pages/Models";
import Settings from "./pages/Settings";
import Skills from "./pages/Skills";

export const router = createHashRouter([
	{
		path: "/float",
		element: <FloatWidget />,
		errorElement: <ErrorPage />,
	},
	{
		path: "/",
		element: <Login />,
		errorElement: <ErrorPage />,
	},
	{
		path: "/chat",
		element: <Chat />,
		errorElement: <ErrorPage />,
	},
	{
		path: "/models",
		element: <Models />,
		errorElement: <ErrorPage />,
	},
	{
		path: "/skills",
		element: <Skills />,
		errorElement: <ErrorPage />,
	},
	{
		path: "/settings",
		element: <Settings />,
		errorElement: <ErrorPage />,
	},
]);
