import { Card } from "antd";
import type React from "react";
import { ArchivedProjectsPanel } from "../../components/settings/ArchivedProjectsPanel";

const ProjectsPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<ArchivedProjectsPanel />
	</Card>
);

export default ProjectsPage;
