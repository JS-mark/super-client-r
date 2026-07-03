import { Card } from "antd";
import type React from "react";
import { ModelList } from "../../components/models/ModelList";
import { ApiKeysConfig } from "../../components/settings/ApiKeysConfig";

const ModelsPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<div className="space-y-4">
			<ModelList />
			<ApiKeysConfig />
		</div>
	</Card>
);

export default ModelsPage;
