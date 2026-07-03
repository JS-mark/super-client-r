import { Card } from "antd";
import type React from "react";
import { ShortcutSettings } from "../../components/settings/ShortcutSettings";

const KeyboardPage: React.FC = () => (
	<Card className="border-0! shadow-none! bg-transparent!">
		<ShortcutSettings />
	</Card>
);

export default KeyboardPage;
