import { EditOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { theme } from "antd";
import { useTranslation } from "react-i18next";

const { useToken } = theme;

export function ChatNewSession() {
	const { t } = useTranslation("chat");
	const { token } = useToken();

	return (
		<div className="flex items-center justify-center h-full w-full">
			<div className="text-center px-6">
				<div
					className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
					style={{
						backgroundColor: token.colorPrimaryBg,
					}}
				>
					<ThunderboltOutlined
						className="text-2xl"
						style={{ color: token.colorPrimary }}
					/>
				</div>

				<div
					className="text-lg font-semibold mb-2"
					style={{ color: token.colorText }}
				>
					{t("newSession.titleAgent", "New Agent Conversation")}
				</div>

				<div
					className="text-sm mb-6"
					style={{ color: token.colorTextTertiary }}
				>
					{t(
						"newSession.descAgent",
						"Agent mode enables tool use and multi-step reasoning",
					)}
				</div>

				<div
					className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full"
					style={{
						color: token.colorTextQuaternary,
						backgroundColor: token.colorFillQuaternary,
					}}
				>
					<EditOutlined />
					{t("newSession.hint", "Click + to start a new conversation")}
				</div>
			</div>
		</div>
	);
}
