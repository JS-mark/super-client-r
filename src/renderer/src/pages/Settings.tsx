import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { AboutModal } from "../components/AboutModal";
import { MainLayout } from "../components/layout/MainLayout";
import {
	SETTINGS_NAVIGATION_GROUPS,
	type SettingsNavigationKey,
} from "../lib/settingsNavigation";
import { type AppInfo, appService } from "../services/appService";

function isSettingsNavigationKey(
	value: string,
): value is SettingsNavigationKey {
	return SETTINGS_NAVIGATION_GROUPS.some((group) => group.key === value);
}

const Settings: React.FC = () => {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [aboutModalOpen, setAboutModalOpen] = useState(false);

	// Settings shell does NOT publish any TitleBar breadcrumb. The Rail
	// itself is the primary "you are in settings" affordance; the right
	// column starts directly with the page content, no extra title chrome.

	// BC: legacy `?tab=<key>` deep-links map to `/settings/<key>`. Removed
	// tabs (mcp / skills / app-plugins / context-memory) fall back to General.
	useEffect(() => {
		const tab = searchParams.get("tab");
		if (!tab) return;
		if (isSettingsNavigationKey(tab)) {
			navigate(`/settings/${tab}`, { replace: true });
		} else {
			navigate("/settings/general", { replace: true });
		}
	}, [searchParams, navigate]);

	useEffect(() => {
		appService.getInfo().then(setAppInfo).catch(console.error);

		const handleNavigate = (_event: unknown, ...args: unknown[]) => {
			const path = args[0] as string;
			if (path.includes("tab=about")) {
				navigate("/settings/about");
				return;
			}
			if (path.includes("tab=debug")) {
				navigate("/settings/advanced");
			}
		};

		const handleAboutModal = () => setAboutModalOpen(true);

		window.electron.ipc.on("navigate-to", handleNavigate);
		window.electron.ipc.on("show-about-modal", handleAboutModal);
		return () => {
			window.electron.ipc.off("navigate-to", handleNavigate);
			window.electron.ipc.off("show-about-modal", handleAboutModal);
		};
	}, [navigate]);

	const openAboutModal = useCallback(() => setAboutModalOpen(true), []);

	const outletContext = useMemo(
		() => ({ appInfo, openAboutModal }),
		[appInfo, openAboutModal],
	);

	return (
		<MainLayout>
			{/* SettingsRail is rendered in MainLayout's sidebar slot when on
			    /settings/*; this children slot is the right-column content.
			    TitleBar already shows the breadcrumb "⚙ 设置 · <page>" via
			    useTitle, so no separate SettingsHeader is needed. */}
			<div className="flex h-full flex-col overflow-hidden">
				<div className="flex-1 overflow-auto">
					<div className="max-w-4xl mx-auto px-6 py-4 settings-content">
						<Outlet context={outletContext} />
					</div>
				</div>
			</div>

			<AboutModal
				open={aboutModalOpen}
				onClose={() => setAboutModalOpen(false)}
				appInfo={appInfo}
			/>
		</MainLayout>
	);
};

export default Settings;
