import { Card } from "antd";
import type React from "react";
import { WebhookSettings } from "../../components/settings/WebhookSettings";

const WebhookPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<WebhookSettings />
	</Card>
);

export default WebhookPage;
