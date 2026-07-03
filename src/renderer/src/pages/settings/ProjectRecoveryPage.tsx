import { Card } from "antd";
import type React from "react";
import { RecoverySettings } from "../../components/settings/RecoverySettings";

const ProjectRecoveryPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<RecoverySettings />
	</Card>
);

export default ProjectRecoveryPage;
