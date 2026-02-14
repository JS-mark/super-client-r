import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enApp from "./locales/en/app.json";
import enAttachment from "./locales/en/attachment.json";
import enBookmarks from "./locales/en/bookmarks.json";
import enChat from "./locales/en/chat.json";
import enCommon from "./locales/en/common.json";
import enError from "./locales/en/error.json";
import enHome from "./locales/en/home.json";
import enLogviewer from "./locales/en/logviewer.json";
import enMcp from "./locales/en/mcp.json";
import enMenu from "./locales/en/menu.json";
import enModels from "./locales/en/models.json";
import enSettings from "./locales/en/settings.json";
import enShortcuts from "./locales/en/shortcuts.json";
import enSkills from "./locales/en/skills.json";
import enUser from "./locales/en/user.json";
import enWindow from "./locales/en/window.json";
import enWorkspaces from "./locales/en/workspaces.json";
// Import all locale files explicitly
import zhApp from "./locales/zh/app.json";
import zhAttachment from "./locales/zh/attachment.json";
import zhBookmarks from "./locales/zh/bookmarks.json";
import zhChat from "./locales/zh/chat.json";
import zhCommon from "./locales/zh/common.json";
import zhError from "./locales/zh/error.json";
import zhHome from "./locales/zh/home.json";
import zhLogviewer from "./locales/zh/logviewer.json";
import zhMcp from "./locales/zh/mcp.json";
import zhMenu from "./locales/zh/menu.json";
import zhModels from "./locales/zh/models.json";
import zhSettings from "./locales/zh/settings.json";
import zhShortcuts from "./locales/zh/shortcuts.json";
import zhSkills from "./locales/zh/skills.json";
import zhUser from "./locales/zh/user.json";
import zhWindow from "./locales/zh/window.json";
import zhWorkspaces from "./locales/zh/workspaces.json";

const resources = {
	zh: {
		app: zhApp,
		attachment: zhAttachment,
		bookmarks: zhBookmarks,
		chat: zhChat,
		common: zhCommon,
		error: zhError,
		home: zhHome,
		logviewer: zhLogviewer,
		mcp: zhMcp,
		menu: zhMenu,
		models: zhModels,
		settings: zhSettings,
		shortcuts: zhShortcuts,
		skills: zhSkills,
		user: zhUser,
		window: zhWindow,
		workspaces: zhWorkspaces,
	},
	en: {
		app: enApp,
		attachment: enAttachment,
		bookmarks: enBookmarks,
		chat: enChat,
		common: enCommon,
		error: enError,
		home: enHome,
		logviewer: enLogviewer,
		mcp: enMcp,
		menu: enMenu,
		models: enModels,
		settings: enSettings,
		shortcuts: enShortcuts,
		skills: enSkills,
		user: enUser,
		window: enWindow,
		workspaces: enWorkspaces,
	},
};

const allNamespaces = [
	"app",
	"attachment",
	"bookmarks",
	"chat",
	"common",
	"error",
	"home",
	"logviewer",
	"mcp",
	"menu",
	"models",
	"settings",
	"shortcuts",
	"skills",
	"user",
	"window",
	"workspaces",
];

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources,
		fallbackLng: "zh",
		debug: import.meta.env.DEV,
		interpolation: {
			escapeValue: false,
		},
		ns: allNamespaces,
		defaultNS: "common",
		fallbackNS: "common",
	});

export default i18n;
