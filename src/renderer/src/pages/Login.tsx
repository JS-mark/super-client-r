import { GithubOutlined, GoogleOutlined } from "@ant-design/icons";
import { Button, Card, Space, Typography } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "../stores/userStore";

const { Title, Text } = Typography;

const Login: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { login } = useUserStore();

	const handleLogin = (provider: "google" | "github" | "mock") => {
		console.log(`Login with ${provider}`);

		// Mock user data - 实际项目中应该从 OAuth 回调获取
		const mockUser = {
			id: `user_${Date.now()}`,
			name: provider === "google" ? "Google User" : provider === "github" ? "GitHub User" : "Test User",
			email: `${provider}_user@example.com`,
		};

		// 保存用户信息
		login(mockUser);

		// 跳转到聊天页面
		navigate("/chat");
	};

	return (
		<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
			{/* Background Decorations - 静态渐变以提高性能 */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl" />
				<div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-400/10 rounded-full blur-3xl" />
			</div>

			{/* Login Card */}
			<Card className="w-[420px] shadow-2xl border-0 bg-white dark:bg-gray-900">
				{/* Logo */}
				<div className="mb-8 text-center">
					<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
						<span className="text-white font-bold text-2xl">S</span>
					</div>
					<Title level={2} className="!mb-2">
						{t("loginTitle", { ns: "app" })}
					</Title>
					<Text type="secondary" className="text-base">
						{t("loginSubtitle", { ns: "app" })}
					</Text>
				</div>

				{/* Login Buttons */}
				<Space orientation="vertical" className="w-full" size="middle">
					<Button
						block
						size="large"
						icon={<GoogleOutlined className="text-lg" />}
						onClick={() => handleLogin("google")}
						className="!h-12 !rounded-xl !font-medium !border-gray-200 hover:!border-blue-300 hover:!shadow-md transition-all"
					>
						{t("signInGoogle", { ns: "app" })}
					</Button>
					<Button
						block
						size="large"
						icon={<GithubOutlined className="text-lg" />}
						onClick={() => handleLogin("github")}
						className="!h-12 !rounded-xl !font-medium !border-gray-200 hover:!border-purple-300 hover:!shadow-md transition-all"
					>
						{t("signInGithub", { ns: "app" })}
					</Button>

					{import.meta.env.DEV && (
						<>
							<div className="relative my-4">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t border-gray-200 dark:border-gray-700" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-white dark:bg-gray-900 px-3 text-gray-400">
										{t("development", { ns: "app" })}
									</span>
								</div>
							</div>

							<Button
								block
								size="large"
								type="dashed"
								onClick={() => handleLogin("mock")}
								className="!h-12 !rounded-xl !font-medium"
							>
								{t("mockLogin", { ns: "app" })}
							</Button>
						</>
					)}
				</Space>

				{/* Footer */}
				<div className="mt-8 text-center">
					<Text type="secondary" className="text-xs">
						{t("terms", { ns: "app" })}
					</Text>
				</div>
			</Card>
		</div>
	);
};

export default Login;