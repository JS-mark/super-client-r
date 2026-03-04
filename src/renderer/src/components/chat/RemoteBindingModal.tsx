/**
 * Remote Binding Modal
 *
 * Allows users to bind a conversation to an IM Bot for two-way message bridging.
 * Includes an inline setup guide with platform-specific help and official links.
 */

import {
	ApiOutlined,
	CheckCircleFilled,
	CloseCircleFilled,
	InfoCircleOutlined,
	LinkOutlined,
} from "@ant-design/icons";
import {
	Alert,
	Button,
	Collapse,
	Input,
	Modal,
	Select,
	Space,
	Steps,
	Tag,
	Typography,
	theme,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIMBotStore } from "../../stores/imbotStore";
import type { BotStatus } from "../../types/electron";

const { Text, Link: AntLink, Paragraph } = Typography;
const { useToken } = theme;

const PLATFORM_LABELS: Record<string, string> = {
	telegram: "Telegram",
	dingtalk: "DingTalk",
	lark: "Lark",
};

/** Platform setup info with official doc links */
const PLATFORM_GUIDES: Record<
	string,
	{
		docUrl: string;
		docLabel: string;
		credentialUrl: string;
		credentialLabel: string;
		chatIdSteps: string[];
	}
> = {
	telegram: {
		docUrl: "https://core.telegram.org/bots/api",
		docLabel: "Telegram Bot API",
		credentialUrl: "https://t.me/BotFather",
		credentialLabel: "@BotFather",
		chatIdSteps: [
			"将 Bot 添加到目标群组",
			"在群组中发送一条消息",
			"访问 https://api.telegram.org/bot<TOKEN>/getUpdates",
			"在返回 JSON 中找到 chat.id（群组为负数，如 -1001234567890）",
		],
	},
	dingtalk: {
		docUrl:
			"https://open.dingtalk.com/document/orgapp/robot-overview",
		docLabel: "钉钉机器人开发文档",
		credentialUrl: "https://open-dev.dingtalk.com/",
		credentialLabel: "钉钉开发者后台",
		chatIdSteps: [
			"在钉钉开发者后台创建应用并获取 AppKey",
			"启动 Bot 后，向机器人发送消息",
			"在机器人回调日志中获取 conversationId",
		],
	},
	lark: {
		docUrl:
			"https://open.feishu.cn/document/client-docs/bot-v3/bot-overview",
		docLabel: "飞书机器人开发文档",
		credentialUrl: "https://open.feishu.cn/app",
		credentialLabel: "飞书开发者后台",
		chatIdSteps: [
			"在飞书开发者后台创建应用并获取 App ID",
			"启动 Bot 后，调用获取群列表 API",
			"Chat ID 以 oc_ 开头，如 oc_abc123def456",
		],
	},
};

interface RemoteBindingModalProps {
	open: boolean;
	onClose: () => void;
	onBind: (botId: string, chatId: string) => Promise<void>;
	checkBotOnline: (botId: string) => Promise<boolean>;
}

export function RemoteBindingModal({
	open,
	onClose,
	onBind,
	checkBotOnline,
}: RemoteBindingModalProps) {
	const { t } = useTranslation("chat");
	const { token } = useToken();
	const { botStatuses, fetchBots } = useIMBotStore();

	const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
	const [chatId, setChatId] = useState("");
	const [isOnline, setIsOnline] = useState<boolean | null>(null);
	const [isChecking, setIsChecking] = useState(false);
	const [isBinding, setIsBinding] = useState(false);

	// Refresh bot list when modal opens
	useEffect(() => {
		if (open) {
			fetchBots();
			setSelectedBotId(null);
			setChatId("");
			setIsOnline(null);
		}
	}, [open, fetchBots]);

	// Check online status when bot is selected
	useEffect(() => {
		if (!selectedBotId) {
			setIsOnline(null);
			return;
		}
		setIsChecking(true);
		checkBotOnline(selectedBotId)
			.then((online) => setIsOnline(online))
			.catch(() => setIsOnline(false))
			.finally(() => setIsChecking(false));
	}, [selectedBotId, checkBotOnline]);

	const handleBind = useCallback(async () => {
		if (!selectedBotId || !chatId.trim()) return;

		setIsBinding(true);
		try {
			await onBind(selectedBotId, chatId.trim());
			onClose();
		} catch {
			// Error handled by caller
		} finally {
			setIsBinding(false);
		}
	}, [selectedBotId, chatId, onBind, onClose]);

	const runningBots = botStatuses.filter((b) => b.status === "running");

	// Determine the selected bot's platform for contextual help
	const selectedPlatform = useMemo(() => {
		if (!selectedBotId) return null;
		const bot = botStatuses.find((b) => b.id === selectedBotId);
		return bot?.type || null;
	}, [selectedBotId, botStatuses]);

	const platformGuide = selectedPlatform
		? PLATFORM_GUIDES[selectedPlatform]
		: null;

	// Step indicator: which step the user is on
	const currentStep = useMemo(() => {
		if (runningBots.length === 0) return 0;
		if (!selectedBotId) return 1;
		if (!chatId.trim()) return 2;
		return 3;
	}, [runningBots.length, selectedBotId, chatId]);

	return (
		<Modal
			title={
				<Space>
					<ApiOutlined />
					{t("remoteChat.bindTitle", "Bind IM Bot")}
				</Space>
			}
			open={open}
			onCancel={onClose}
			footer={[
				<Button key="cancel" onClick={onClose}>
					{t("remoteChat.cancel", "Cancel")}
				</Button>,
				<Button
					key="bind"
					type="primary"
					onClick={handleBind}
					loading={isBinding}
					disabled={!selectedBotId || !chatId.trim() || isOnline === false}
				>
					{t("remoteChat.bind", "Bind")}
				</Button>,
			]}
			width={540}
		>
			<div className="flex flex-col gap-4 py-2">
				{/* Progress Steps */}
				<Steps
					size="small"
					current={currentStep}
					items={[
						{
							title: t("remoteChat.steps.startBot", "Start Bot"),
						},
						{
							title: t("remoteChat.steps.selectBot", "Select"),
						},
						{
							title: t("remoteChat.steps.enterChatId", "Chat ID"),
						},
						{
							title: t("remoteChat.steps.bind", "Bind"),
						},
					]}
				/>

				{/* Bot Selection */}
				<div>
					<Text className="block mb-1.5" strong>
						{t("remoteChat.selectBot", "Select Bot")}
					</Text>
					{runningBots.length === 0 ? (
						<Alert
							type="warning"
							showIcon
							message={t(
								"remoteChat.noRunningBots",
								"No running bots. Please start a bot in IM Bot page first.",
							)}
							description={
								<div className="mt-2">
									<Paragraph
										type="secondary"
										className="text-xs mb-2"
									>
										{t(
											"remoteChat.setupHint",
											"Create and start an IM Bot first, then come back here to bind it.",
										)}
									</Paragraph>
									<Space wrap>
										<AntLink
											href="https://core.telegram.org/bots#how-do-i-create-a-bot"
											target="_blank"
											className="text-xs"
										>
											<LinkOutlined /> Telegram
										</AntLink>
										<AntLink
											href="https://open.dingtalk.com/document/orgapp/robot-overview"
											target="_blank"
											className="text-xs"
										>
											<LinkOutlined />{" "}
											{t("remoteChat.platform.dingtalk", "DingTalk")}
										</AntLink>
										<AntLink
											href="https://open.feishu.cn/document/client-docs/bot-v3/bot-overview"
											target="_blank"
											className="text-xs"
										>
											<LinkOutlined />{" "}
											{t("remoteChat.platform.lark", "Lark")}
										</AntLink>
									</Space>
								</div>
							}
						/>
					) : (
						<Select
							className="w-full"
							placeholder={t(
								"remoteChat.selectBotPlaceholder",
								"Select a running bot...",
							)}
							value={selectedBotId}
							onChange={setSelectedBotId}
							options={runningBots.map((bot: BotStatus) => ({
								value: bot.id,
								label: (
									<Space>
										<span>{bot.name}</span>
										<Tag color="blue" className="text-xs">
											{PLATFORM_LABELS[bot.type] || bot.type}
										</Tag>
									</Space>
								),
							}))}
						/>
					)}
				</div>

				{/* Online Status */}
				{selectedBotId && (
					<div className="flex items-center gap-2">
						<Text type="secondary">
							{t("remoteChat.status", "Status")}:
						</Text>
						{isChecking ? (
							<Text type="secondary">
								{t("remoteChat.checking", "Checking...")}
							</Text>
						) : isOnline ? (
							<Space>
								<CheckCircleFilled style={{ color: token.colorSuccess }} />
								<Text type="success">
									{t("remoteChat.online", "Online")}
								</Text>
							</Space>
						) : (
							<Space>
								<CloseCircleFilled style={{ color: token.colorError }} />
								<Text type="danger">
									{t("remoteChat.offline", "Offline")}
								</Text>
							</Space>
						)}
					</div>
				)}

				{/* Chat ID Input */}
				<div>
					<Text className="block mb-1.5" strong>
						{t("remoteChat.chatId", "Chat ID")}
					</Text>
					<Input
						placeholder={t(
							"remoteChat.chatIdPlaceholder",
							"Enter the chat/group ID to bridge...",
						)}
						value={chatId}
						onChange={(e) => setChatId(e.target.value)}
						onPressEnter={handleBind}
					/>
					<Text type="secondary" className="text-xs mt-1 block">
						{t(
							"remoteChat.chatIdHint",
							"The chat ID or group ID where messages will be sent/received.",
						)}
					</Text>
				</div>

				{/* Platform-specific Setup Guide */}
				{platformGuide && (
					<Collapse
						size="small"
						items={[
							{
								key: "guide",
								label: (
									<Space>
										<InfoCircleOutlined />
										<span className="text-xs">
											{t("remoteChat.howToGetChatId", "How to get Chat ID?")}
										</span>
									</Space>
								),
								children: (
									<div className="flex flex-col gap-2">
										<ol className="text-xs pl-4 mb-2 space-y-1">
											{platformGuide.chatIdSteps.map((step, i) => (
												<li key={i}>{step}</li>
											))}
										</ol>
										<Space wrap>
											<AntLink
												href={platformGuide.docUrl}
												target="_blank"
												className="text-xs"
											>
												<LinkOutlined /> {platformGuide.docLabel}
											</AntLink>
											<AntLink
												href={platformGuide.credentialUrl}
												target="_blank"
												className="text-xs"
											>
												<LinkOutlined /> {platformGuide.credentialLabel}
											</AntLink>
										</Space>
									</div>
								),
							},
						]}
					/>
				)}
			</div>
		</Modal>
	);
}
