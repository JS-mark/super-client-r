import { Card } from "antd";
import type React from "react";
import { ProjectArchiveManager } from "../../components/settings/ProjectArchiveManager";

const ProjectsPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<ProjectArchiveManager />
	</Card>
);

export default ProjectsPage;
