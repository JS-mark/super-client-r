import {
	GithubOutlined,
	GoogleOutlined,
	MailOutlined,
} from "@ant-design/icons";
import {
	Alert,
	Button,
	Card,
	Input,
	Space,
	Typography,
	message,
	theme,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useUserStore } from "../stores/userStore";

const { useToken } = theme;

const { Title, Text } = Typography;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

const Login: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { login, loginWithOAuth, sendEmailCode, loginWithEmail, isLoading, error } =
		useUserStore();
	const { token } = useToken();
	const [loginProvider, setLoginProvider] = useState<string | null>(null);

	// 邮箱登录状态
	const [emailMode, setEmailMode] = useState(false);
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [sending, setSending] = useState(false);
	const [countdown, setCountdown] = useState(0);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, []);

	const startCountdown = useCallback(() => {
		setCountdown(RESEND_SECONDS);
		if (timerRef.current) clearInterval(timerRef.current);
		timerRef.current = setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					if (timerRef.current) clearInterval(timerRef.current);
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	}, []);

	const handleOAuthLogin = useCallback(
		async (provider: "google" | "github") => {
			setLoginProvider(provider);
			try {
				await loginWithOAuth(provider);
				// Check if login succeeded (store is updated)
				const state = useUserStore.getState();
				if (state.isLoggedIn) {
					navigate("/chat");
				}
			} finally {
				setLoginProvider(null);
			}
		},
		[loginWithOAuth, navigate],
	);

	const handleSendCode = useCallback(async () => {
		const normalized = email.trim().toLowerCase();
		if (!EMAIL_REGEX.test(normalized)) {
			setEmailError(t("emailInvalid", { ns: "app" }));
			return;
		}
		setEmailError(null);
		setSending(true);
		try {
			const ok = await sendEmailCode(normalized);
			if (ok) {
				message.success(t("codeSent", { ns: "app" }));
				startCountdown();
			}
		} finally {
			setSending(false);
		}
	}, [email, sendEmailCode, startCountdown, t]);

	const handleEmailLogin = useCallback(async () => {
		const normalized = email.trim().toLowerCase();
		if (!EMAIL_REGEX.test(normalized)) {
			setEmailError(t("emailInvalid", { ns: "app" }));
			return;
		}
		if (!code.trim()) {
			setEmailError(t("codeRequired", { ns: "app" }));
			return;
		}
		setEmailError(null);
		const ok = await loginWithEmail(normalized, code.trim());
		if (ok) {
			navigate("/chat");
		}
	}, [email, code, loginWithEmail, navigate, t]);

	const handleMockLogin = useCallback(() => {
		const mockUser = {
			id: `user_${Date.now()}`,
			name: "Test User",
			email: "test@example.com",
		};
		login(mockUser);
		navigate("/chat");
	}, [login, navigate]);

	return (
		<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50">
			{/* Background Decorations - 静态渐变以提高性能 */}
			<div className="absolute inset-0 overflow-hidden pointer-events-none">
				<div className="absolute top-20 left-20 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl" />
				<div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl" />
				<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-400/10 rounded-full blur-3xl" />
			</div>

			{/* Login Card */}
			<Card
				className="w-[420px] shadow-2xl border-0"
				style={{ backgroundColor: token.colorBgContainer }}
			>
				{/* Logo */}
				<div className="mb-8 text-center">
					<div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
						<span className="text-white font-bold text-2xl">S</span>
					</div>
					<Title level={2} className="mb-2!">
						{t("loginTitle", { ns: "app" })}
					</Title>
					<Text type="secondary" className="text-base">
						{t("loginSubtitle", { ns: "app" })}
					</Text>
				</div>

				{/* Error Message */}
				{error && (
					<Alert
						message={error}
						type="error"
						showIcon
						closable
						className="mb-4"
					/>
				)}

				{emailMode ? (
					/* 邮箱登录：两步交互 */
					<Space orientation="vertical" className="w-full" size="middle">
						<div>
							<Input
								size="large"
								prefix={<MailOutlined className="text-gray-400" />}
								placeholder={t("emailPlaceholder", { ns: "app" })}
								value={email}
								onChange={(e) => {
									setEmail(e.target.value);
									if (emailError) setEmailError(null);
								}}
								disabled={isLoading || sending}
								status={emailError ? "error" : undefined}
								className="h-12! rounded-xl!"
							/>
							{emailError && (
								<Text type="danger" className="text-xs mt-1 block">
									{emailError}
								</Text>
							)}
						</div>

						<div className="flex gap-2">
							<Input
								size="large"
								placeholder={t("emailCodePlaceholder", { ns: "app" })}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								onPressEnter={handleEmailLogin}
								disabled={isLoading}
								className="h-12! rounded-xl! flex-1"
							/>
							<Button
								size="large"
								onClick={handleSendCode}
								loading={sending}
								disabled={countdown > 0 || isLoading}
								className="h-12! rounded-xl! font-medium! whitespace-nowrap"
							>
								{countdown > 0
									? t("resendCountdown", { ns: "app", seconds: countdown })
									: t("sendCode", { ns: "app" })}
							</Button>
						</div>

						<Button
							block
							size="large"
							type="primary"
							onClick={handleEmailLogin}
							loading={isLoading}
							className="h-12! rounded-xl! font-medium!"
						>
							{t("emailLoginButton", { ns: "app" })}
						</Button>

						<Button
							block
							type="link"
							onClick={() => {
								setEmailMode(false);
								setEmailError(null);
							}}
							disabled={isLoading}
						>
							{t("backToOptions", { ns: "app" })}
						</Button>
					</Space>
				) : (
					/* Login Buttons */
					<Space orientation="vertical" className="w-full" size="middle">
						<Button
							block
							size="large"
							icon={<GoogleOutlined className="text-lg" />}
							onClick={() => handleOAuthLogin("google")}
							loading={isLoading && loginProvider === "google"}
							disabled={isLoading}
							className="h-12! rounded-xl! font-medium! border-gray-200! hover:border-blue-300! hover:shadow-md! transition-all"
						>
							{t("signInGoogle", { ns: "app" })}
						</Button>
						<Button
							block
							size="large"
							icon={<GithubOutlined className="text-lg" />}
							onClick={() => handleOAuthLogin("github")}
							loading={isLoading && loginProvider === "github"}
							disabled={isLoading}
							className="h-12! rounded-xl! font-medium! border-gray-200! hover:border-purple-300! hover:shadow-md! transition-all"
						>
							{t("signInGithub", { ns: "app" })}
						</Button>
						<Button
							block
							size="large"
							icon={<MailOutlined className="text-lg" />}
							onClick={() => setEmailMode(true)}
							disabled={isLoading}
							className="h-12! rounded-xl! font-medium! border-gray-200! hover:border-blue-300! hover:shadow-md! transition-all"
						>
							{t("signInEmail", { ns: "app" })}
						</Button>

						{import.meta.env.DEV && (
							<>
								<div className="relative my-4">
									<div className="absolute inset-0 flex items-center">
										<span
											className="w-full border-t"
											style={{ borderColor: token.colorBorder }}
										/>
									</div>
									<div className="relative flex justify-center text-xs uppercase">
										<span
											className="px-3 text-gray-400"
											style={{ backgroundColor: token.colorBgContainer }}
										>
											{t("development", { ns: "app" })}
										</span>
									</div>
								</div>

								<Button
									block
									size="large"
									type="dashed"
									onClick={handleMockLogin}
									disabled={isLoading}
									className="h-12! rounded-xl! font-medium!"
								>
									{t("mockLogin", { ns: "app" })}
								</Button>
							</>
						)}
					</Space>
				)}

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
