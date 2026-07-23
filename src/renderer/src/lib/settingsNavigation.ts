export const SETTINGS_NAVIGATION_GROUPS = [
	{
		key: "general",
		labelKey: "general",
		fallback: "General",
	},
	{
		key: "models",
		labelKey: "models",
		fallback: "Models",
	},
	{
		key: "third-party-api",
		labelKey: "settingsNav.thirdPartyApi",
		fallback: "Third-party API",
	},
	{
		key: "tools-permissions",
		labelKey: "settingsNav.toolsPermissions",
		fallback: "Tools & Permissions",
	},
	{
		key: "projects",
		labelKey: "settingsNav.projects",
		fallback: "Projects",
	},
	{
		key: "project-recovery",
		labelKey: "settingsNav.projectRecovery",
		fallback: "Project Recovery",
	},
	{
		key: "keyboard",
		labelKey: "settingsNav.keyboard",
		fallback: "Keyboard",
	},
	{
		key: "api-service",
		labelKey: "settingsNav.apiService",
		fallback: "API Service",
	},
	{
		key: "webhook",
		labelKey: "settingsNav.webhook",
		fallback: "Webhook",
	},
	{
		key: "advanced",
		labelKey: "settingsNav.advanced",
		fallback: "Advanced",
	},
	{
		key: "about",
		labelKey: "settingsNav.about",
		fallback: "About",
	},
] as const;

export type SettingsNavigationKey =
	(typeof SETTINGS_NAVIGATION_GROUPS)[number]["key"];
