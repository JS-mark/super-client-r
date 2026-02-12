import {
	BookOutlined,
	CopyOutlined,
	GlobalOutlined,
	LinkOutlined,
	PlayCircleOutlined,
	PoweroffOutlined,
	ReloadOutlined,
} from "@ant-design/icons";
import { Button, Card, Form, InputNumber, Tooltip, message } from "antd";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type ApiStatus, apiService } from "../../services/apiService";
import { appService } from "../../services/appService";
import { SettingSection } from "./SettingSection";

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const DEFAULT_PORT = 3000;

export const ApiServiceSettings: React.FC = () => {
	const { t } = useTranslation();
	const [apiStatus, setApiStatus] = useState<ApiStatus>({
		status: "stopped",
		port: 0,
	});
	const [apiLoading, setApiLoading] = useState(false);
	const [loading, setLoading] = useState(true);
	const [form] = Form.useForm();

	const loadStatus = useCallback(async () => {
		try {
			setLoading(true);
			const status = await apiService.getStatus();
			setApiStatus(status);
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

	const handleApiAction = async (action: "start" | "stop" | "restart") => {
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
		} catch (e) {
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
	};

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

	return (
		<Card
			className="!border-0 !shadow-none !bg-transparent"
			loading={loading}
		>
			<SettingSection
				title={t("apiService", "API Service", { ns: "settings" })}
			>
				<Form form={form} layout="inline" className="w-full">
					<div className="flex items-center gap-4 flex-wrap w-full">
						<div className="flex items-center gap-2 min-w-[120px]">
							<div
								className={`w-2.5 h-2.5 rounded-full ${apiStatus.status === "running"
									? "bg-green-500 animate-pulse"
									: "bg-red-500"
									}`}
							/>
							<span
								className={`font-medium text-sm uppercase ${apiStatus.status === "running"
									? "text-green-600 dark:text-green-400"
									: "text-red-600 dark:text-red-400"
									}`}
							>
								{apiStatus.status === "running"
									? t("running", "Running", { ns: "settings" })
									: t("stopped", "Stopped", { ns: "settings" })}
							</span>
						</div>

						<Form.Item
							name="port"
							rules={[{ validator: validatePort }]}
							className="!mb-0 flex-shrink-0"
						>
							<InputNumber
								min={PORT_MIN}
								max={PORT_MAX}
								placeholder={`${DEFAULT_PORT}`}
								prefix={
									<span className="text-slate-400 text-xs mr-1">Port</span>
								}
								className="!w-[140px]"
								size="middle"
								disabled={apiStatus.status === "running"}
							/>
						</Form.Item>

						<div className="flex items-center gap-2 ml-auto">
							{apiStatus.status === "stopped" ? (
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
									<Button
										danger
										icon={<PoweroffOutlined />}
										onClick={() => handleApiAction("stop")}
										loading={apiLoading}
										className="!rounded-lg"
									>
										{t("stop", "Stop", { ns: "settings" })}
									</Button>
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
								</>
							)}
						</div>
					</div>

					{apiStatus.status === "running" && (
						<>
							<div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
								<LinkOutlined />
								<span>
									{t("listeningOn", "Listening on", { ns: "settings" })}:{" "}
									<code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-400">
										http://localhost:{apiStatus.port}
									</code>
								</span>
								<Button
									type="link"
									size="small"
									icon={<CopyOutlined />}
									onClick={() => {
										navigator.clipboard.writeText(
											`http://localhost:${apiStatus.port}`,
										);
										message.success(
											t("copied", "Copied to clipboard", {
												ns: "settings",
											}),
										);
									}}
									className="!px-1"
								/>
							</div>
							<div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
								<BookOutlined />
								<span>
									{t("apiDocs", "API Docs", { ns: "settings" })}:{" "}
									<Button
										type="link"
										size="small"
										className="!px-0 !py-0 h-auto"
										onClick={() => {
											appService.openExternal(
												`http://localhost:${apiStatus.port}/api-docs`,
											);
										}}
									>
										<code className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-blue-600 dark:text-blue-400">
											http://localhost:{apiStatus.port}/api-docs
										</code>
									</Button>
								</span>
							</div>
						</>
					)}
				</Form>
			</SettingSection>
		</Card>
	);
};
