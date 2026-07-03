import { Card } from "antd";
import type React from "react";
import { useOutletContext } from "react-router-dom";
import { AboutSection } from "../../components/settings/AboutSection";
import type { AppInfo } from "../../services/appService";

export interface SettingsOutletContext {
	appInfo: AppInfo | null;
	openAboutModal: () => void;
}

const AboutPage: React.FC = () => {
	const { appInfo, openAboutModal } = useOutletContext<SettingsOutletContext>();
	return (
		<Card className="border-0! shadow-none! bg-transparent!">
			<AboutSection
				appInfo={appInfo}
				onOpenGitHub={() =>
					window.open("https://github.com/js-mark/super-client-r", "_blank")
				}
				onReportBug={() =>
					window.open(
						"https://github.com/js-mark/super-client-r/issues",
						"_blank",
					)
				}
				onOpenLicense={() =>
					window.open(
						"https://github.com/js-mark/super-client-r/blob/main/LICENSE",
						"_blank",
					)
				}
				onOpenModal={openAboutModal}
			/>
		</Card>
	);
};

export default AboutPage;
