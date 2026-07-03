import { Card } from "antd";
import type React from "react";
import { SearchSettings } from "../../components/settings/SearchSettings";

const AgentPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<SearchSettings />
	</Card>
);

export default AgentPage;
