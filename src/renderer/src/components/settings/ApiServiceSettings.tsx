import {
	BookOutlined,
	CopyOutlined,
	PlayCircleOutlined,
	PoweroffOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { Button, Form, InputNumber, message, Tooltip, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ApiStatus, apiService } from "../../services/apiService";
import { appService } from "../../services/appService";

const { useToken } = theme;

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const DEFAULT_PORT = 3000;

export const ApiServiceSettings: React.FC = () => {
	const { t } = useTranslation();
	const { token } = useToken();
	const [apiStatus, setApiStatus] = useState<ApiStatus>({
		status: "stopped",
		port: 0,
	});
	const [apiLoading, setApiLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [apiKey, setApiKey] = useState("");
	const [form] = Form.useForm();

	const loadStatus = useCallback(async () => {
		try {
			setLoading(true);
			const [status, key] = await Promise.all([
				apiService.getStatus(),
				apiService.getApiKey(),
			]);
			setApiStatus(status);
			setApiKey(key || "");
			form.setFieldsValue({ port: status.port || DEFAULT_PORT });
		} catch (e) {
			console.error("Failed to load API status:", e);
		} finally {
			setLoading(false);
		}
	}, [form]);

	useEffect(() => {
		loadStatus();

		const handleStatusUpdate = (_event: unknown, ...args: unknown[]) => {
			const status = args[0] as ApiStatus;
			setApiStatus(status);
			if (status.port) {
				form.setFieldValue("port", status.port);
			}
		};

		window.electron.ipc.on("server-status-update", handleStatusUpdate);
		return () => {
			window.electron.ipc.off("server-status-update", handleStatusUpdate);
		};
	}, [loadStatus, form]);

	const handleApiAction = useCallback(
		async (action: "start" | "stop" | "restart") => {
			setApiLoading(true);
			try {
				const port = form.getFieldValue("port");
				if (action === "start") {
					await apiService.start();
				} else if (action === "stop") {
					await apiService.stop();
				} else if (action === "restart") {
					await apiService.setPort(Number(port));
					await apiService.restart(Number(port));
				}
				message.success(
					t(
						`settings.api${action.charAt(0).toUpperCase() + action.slice(1)}Success`,
						`Server ${action}ed successfully`,
					),
				);
			} catch {
				message.error(
					t(
						`settings.api${action.charAt(0).toUpperCase() + action.slice(1)}Error`,
						`Failed to ${action} server`,
					),
				);
			} finally {
				setApiLoading(false);
				loadStatus();
			}
		},
		[form, loadStatus, t],
	);

	const copyToClipboard = useCallback(
		(text: string) => {
			navigator.clipboard.writeText(text);
			message.success(t("copied", "Copied to clipboard", { ns: "settings" }));
		},
		[t],
	);

	const validatePort = (_: unknown, value: number) => {
		if (!value) {
			return Promise.reject(
				new Error(t("portRequired", "Port is required", { ns: "settings" })),
			);
		}
		if (value < PORT_MIN || value > PORT_MAX) {
			return Promise.reject(
				new Error(
					t(
						"settings.portRange",
						`Port must be between ${PORT_MIN} and ${PORT_MAX}`,
					),
				),
			);
		}
		return Promise.resolve();
	};

	const isRunning = apiStatus.status === "running";
	const serverUrl = `http://127.0.0.1:${apiStatus.port}`;

	if (loading) {
		return (
			<div className="flex justify-center items-center py-20">
				<div
					className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
					style={{
						borderColor: token.colorPrimary,
						borderTopColor: "transparent",
					}}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h3
						className="text-lg font-semibold m-0"
						style={{ color: token.colorText }}
					>
						{t("apiServerTitle", "API Server", { ns: "settings" })}
					</h3>
					<p
						className="text-xs m-0 mt-1"
						style={{ color: token.colorTextSecondary }}
					>
						{t(
							"apiServerDescription",
							"Expose AI capabilities through an OpenAI-compatible HTTP API",
							{ ns: "settings" },
						)}
					</p>
				</div>
				{isRunning && (
					<Button
						type="primary"
						icon={<BookOutlined />}
						onClick={() => {
							appService.openExternal(
								`http://localhost:${apiStatus.port}/api-docs`,
							);
						}}
						className="!rounded-lg"
					>
						{t("apiDocs", "API Docs", { ns: "settings" })}
					</Button>
				)}
			</div>

			{/* Status Card */}
			<div
				className="p-4 rounded-xl border"
				style={{
					backgroundColor: token.colorBgContainer,
					borderColor: token.colorBorderSecondary,
				}}
			>
				<Form form={form} className="w-full">
					<div className="flex items-center gap-4">
						{/* Status indicator */}
						<div className="flex items-center gap-2 shrink-0">
							<div
								className={`w-2.5 h-2.5 rounded-full ${
									isRunning ? "bg-green-500 animate-pulse" : "bg-red-500"
								}`}
							/>
							<span
								className="font-medium text-sm"
								style={{
									color: isRunning ? token.colorSuccess : token.colorError,
								}}
							>
								{isRunning
									? t("running", "Running", { ns: "settings" })
									: t("stopped", "Stopped", { ns: "settings" })}
							</span>
						</div>

						{/* URL or Port input */}
						{isRunning ? (
							<div
								className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg min-w-0"
								style={{ backgroundColor: token.colorFillQuaternary }}
							>
								<code
									className="text-sm truncate flex-1"
									style={{ color: token.colorText }}
								>
									{serverUrl}
								</code>
								<Button
									type="text"
									size="small"
									icon={<CopyOutlined />}
									onClick={() => copyToClipboard(serverUrl)}
									className="shrink-0"
								/>
							</div>
						) : (
							<Form.Item
								name="port"
								rules={[{ validator: validatePort }]}
								className="!mb-0 flex-1"
							>
								<InputNumber
									min={PORT_MIN}
									max={PORT_MAX}
									placeholder={`${DEFAULT_PORT}`}
									prefix={
										<span className="text-slate-400 text-xs mr-1">Port</span>
									}
									className="!w-full"
									size="middle"
								/>
							</Form.Item>
						)}

						{/* Actions */}
						<div className="flex items-center gap-2 shrink-0">
							{!isRunning ? (
								<Button
									type="primary"
									icon={<PlayCircleOutlined />}
									onClick={() => handleApiAction("start")}
									loading={apiLoading}
									className="!rounded-lg"
								>
									{t("start", "Start", { ns: "settings" })}
								</Button>
							) : (
								<>
									<Tooltip
										title={t("restartTip", "Apply port changes", {
											ns: "settings",
										})}
									>
										<Button
											icon={<ReloadOutlined />}
											onClick={() => handleApiAction("restart")}
											loading={apiLoading}
											className="!rounded-lg"
										>
											{t("restart", "Restart", { ns: "settings" })}
										</Button>
									</Tooltip>
									<Button
										danger
										icon={<PoweroffOutlined />}
										onClick={() => handleApiAction("stop")}
										loading={apiLoading}
										className="!rounded-lg"
									>
										{t("stop", "Stop", { ns: "settings" })}
									</Button>
								</>
							)}
						</div>
					</div>
				</Form>
			</div>

			{/* API Key Card */}
			{apiKey && (
				<div
					className="p-4 rounded-xl border"
					style={{
						backgroundColor: token.colorBgContainer,
						borderColor: token.colorBorderSecondary,
					}}
				>
					<div className="mb-3">
						<h4
							className="text-sm font-medium m-0"
							style={{ color: token.colorText }}
						>
							{t("apiKeyTitle", "API Key", { ns: "settings" })}
						</h4>
						<p
							className="text-xs m-0 mt-0.5"
							style={{ color: token.colorTextTertiary }}
						>
							{t(
								"apiKeyDescription",
								"Security token for API access authentication",
								{ ns: "settings" },
							)}
						</p>
					</div>

					{/* Key display */}
					<div
						className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3"
						style={{ backgroundColor: token.colorFillQuaternary }}
					>
						<code
							className="text-sm flex-1 truncate"
							style={{ color: token.colorText }}
						>
							{apiKey}
						</code>
						<Button
							type="text"
							size="small"
							icon={<CopyOutlined />}
							onClick={() => copyToClipboard(apiKey)}
							className="shrink-0"
						/>
					</div>

					{/* Auth header */}
					<div>
						<span
							className="text-xs"
							style={{ color: token.colorTextTertiary }}
						>
							{t("authHeader", "Authorization Header", { ns: "settings" })}
						</span>
						<div
							className="flex items-center gap-2 px-3 py-2 rounded-lg mt-1"
							style={{ backgroundColor: token.colorFillQuaternary }}
						>
							<code
								className="text-xs flex-1 truncate"
								style={{ color: token.colorTextSecondary }}
							>
								Authorization: Bearer {apiKey}
							</code>
							<Button
								type="text"
								size="small"
								icon={<CopyOutlined />}
								onClick={() =>
									copyToClipboard(`Authorization: Bearer ${apiKey}`)
								}
								className="shrink-0"
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};
