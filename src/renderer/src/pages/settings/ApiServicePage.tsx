import { Card } from "antd";
import type React from "react";
import { ApiServiceSettings } from "../../components/settings/ApiServiceSettings";

const ApiServicePage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<ApiServiceSettings />
	</Card>
);

export default ApiServicePage;
