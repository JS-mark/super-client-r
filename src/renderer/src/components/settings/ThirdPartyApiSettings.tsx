import {
	CheckCircleFilled,
	CopyOutlined,
	EyeInvisibleOutlined,
	EyeOutlined,
	KeyOutlined,
	LinkOutlined,
	LockOutlined,
	SafetyCertificateOutlined,
	SaveOutlined,
	SearchOutlined,
} from "@ant-design/icons";
import { App, Button, Input, Tooltip, theme } from "antd";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { appService } from "../../services/appService";
import { SearchSettings } from "./SearchSettings";
import { createLogger } from "../../services/logService";

const log = createLogger("ThirdPartyApiSettings");

const { useToken } = theme;

/**
 * A single third-party API provider configuration.
 *
 * The page is intentionally shaped as a list so future providers (OpenRouter,
 * Anthropic direct, custom relays, …) can be added by pushing another entry —
 * every provider gets the same visual treatment (header row + credential
 * input + docs link + save affordance).
 */
interface ProviderDef {
	id: string;
	/** i18n label for the provider display name. */
	nameKey: string;
	nameFallback: string;
	/** i18n label for the one-line description under the name. */
	descKey: string;
	descFallback: string;
	/** Storage key in main-process store (via app:get-config / set-config). */
	storeKey: string;
	/** Public docs / dashboard URL — opens externally via app.openExternal. */
	docsUrl: string;
	/** Display label for the docs link ("skillsmp.com"). */
	docsLabel: string;
	/** Two-letter avatar text (mono, uppercase). */
	avatar: string;
	/** Tint used for the avatar background + subtle accents. */
	accent: string;
}

const PROVIDERS: ProviderDef[] = [
	{
		id: "skillsmp",
		nameKey: "thirdPartyApi.providers.skillsmp.name",
		nameFallback: "SkillsMP",
		descKey: "thirdPartyApi.providers.skillsmp.desc",
		descFallback:
			"Connect to skillsmp.com for the skill marketplace and cloud services",
		storeKey: "skillsmpApiKey",
		docsUrl: "https://skillsmp.com",
		docsLabel: "skillsmp.com",
		avatar: "SM",
		accent: "#6366f1", // indigo-500
	},
];

interface IPCResult<T = unknown> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * Unwrap the standard `{success, data, error}` envelope produced by the
 * auto-registered IPC handlers. Falls back to raw value when the payload
 * isn't shaped like the envelope (older handlers, tests).
 */
function unwrapConfig(raw: unknown): string {
	if (raw && typeof raw === "object" && "success" in raw) {
		const r = raw as IPCResult<unknown>;
		if (r.success && typeof r.data === "string") return r.data;
		return "";
	}
	return typeof raw === "string" ? raw : "";
}

interface ProviderState {
	value: string;
	original: string;
	revealed: boolean;
	saving: boolean;
	justSaved: boolean;
}

const emptyProviderState: ProviderState = {
	value: "",
	original: "",
	revealed: false,
	saving: false,
	justSaved: false,
};

export const ThirdPartyApiSettings: React.FC = () => {
	const { message } = App.useApp();
	const { t } = useTranslation();
	const { token } = useToken();

	const [states, setStates] = useState<Record<string, ProviderState>>(() =>
		Object.fromEntries(PROVIDERS.map((p) => [p.id, { ...emptyProviderState }])),
	);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const entries = await Promise.all(
					PROVIDERS.map(async (p) => {
						const raw = await window.electron.ipc.invoke(
							"app:get-config",
							p.storeKey,
						);
						return [p.id, unwrapConfig(raw)] as const;
					}),
				);
				if (cancelled) return;
				setStates((prev) => {
					const next = { ...prev };
					for (const [id, value] of entries) {
						next[id] = { ...emptyProviderState, value, original: value };
					}
					return next;
				});
			} catch (e) {
				log.error("Failed to load third-party API configs", e instanceof Error ? e : new Error(String(e)));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const patchState = useCallback(
		(id: string, patch: Partial<ProviderState>) =>
			setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } })),
		[],
	);

	const handleSave = useCallback(
		async (provider: ProviderDef) => {
			const st = states[provider.id];
			if (!st) return;
			patchState(provider.id, { saving: true });
			try {
				await window.electron.ipc.invoke(
					"app:set-config",
					provider.storeKey,
					st.value.trim(),
				);
				patchState(provider.id, {
					saving: false,
					justSaved: true,
					original: st.value.trim(),
					value: st.value.trim(),
				});
				message.success(
					t("thirdPartyApi.saved", "Saved", { ns: "settings" }),
				);
				setTimeout(() => patchState(provider.id, { justSaved: false }), 1600);
			} catch (e) {
				log.error("Failed to save API key", e instanceof Error ? e : new Error(String(e)));
				patchState(provider.id, { saving: false });
				message.error(
					t("thirdPartyApi.saveError", "Failed to save", { ns: "settings" }),
				);
			}
		},
		[states, patchState, message, t],
	);

	const handleCopy = useCallback(
		async (id: string) => {
			const st = states[id];
			if (!st?.value) return;
			try {
				await navigator.clipboard.writeText(st.value);
				message.success(
					t("thirdPartyApi.copied", "Copied to clipboard", { ns: "settings" }),
				);
			} catch {
				message.error(
					t("thirdPartyApi.copyError", "Copy failed", { ns: "settings" }),
				);
			}
		},
		[states, message, t],
	);

	const handleOpenDocs = useCallback(
		async (url: string) => {
			try {
				await appService.openExternal(url);
			} catch (e) {
				log.error("Failed to open docs", e instanceof Error ? e : new Error(String(e)));
			}
		},
		[],
	);

	return (
		<div className="space-y-5">
			{/* Header */}
			<header className="flex items-start gap-3">
				<div
					className="flex-none flex items-center justify-center rounded-2xl"
					style={{
						width: 44,
						height: 44,
						background: `linear-gradient(135deg, ${token.colorPrimary}22, ${token.colorPrimary}0a)`,
						color: token.colorPrimary,
					}}
					aria-hidden="true"
				>
					<KeyOutlined style={{ fontSize: 20 }} />
				</div>
				<div className="flex-1 min-w-0">
					<h2
						className="text-base font-semibold m-0"
						style={{ color: token.colorTextHeading }}
					>
						{t("thirdPartyApi.pageTitle", "Third-party API", {
							ns: "settings",
						})}
					</h2>
					<p
						className="text-xs mt-1 mb-0"
						style={{ color: token.colorTextSecondary }}
					>
						{t(
							"thirdPartyApi.pageDesc",
							"Manage credentials for external AI services. Keys are stored locally on this device and never uploaded.",
							{ ns: "settings" },
						)}
					</p>
				</div>
			</header>

			{/* Section: API Keys */}
			<section className="space-y-3">
				<SectionHeader
					icon={<KeyOutlined />}
					title={t("thirdPartyApi.section.apiKeys", "API keys", {
						ns: "settings",
					})}
					desc={t(
						"thirdPartyApi.section.apiKeysDesc",
						"Credentials for connecting to external AI providers.",
						{ ns: "settings" },
					)}
				/>
				<div className="space-y-3">
					{PROVIDERS.map((provider) => {
						const st = states[provider.id] ?? emptyProviderState;
						const configured = !loading && Boolean(st.original);
						const dirty = st.value.trim() !== st.original;

						return (
							<ProviderCard
								key={provider.id}
								provider={provider}
								state={st}
								configured={configured}
								dirty={dirty}
								loading={loading}
								onChange={(value) => patchState(provider.id, { value })}
								onToggleReveal={() =>
									patchState(provider.id, { revealed: !st.revealed })
								}
								onCopy={() => handleCopy(provider.id)}
								onSave={() => handleSave(provider)}
								onOpenDocs={() => handleOpenDocs(provider.docsUrl)}
								onReset={() => patchState(provider.id, { value: st.original })}
							/>
						);
					})}
				</div>
			</section>

			{/* Section: Web search providers */}
			<section
				className="rounded-2xl border p-4"
				style={{
					background: token.colorBgContainer,
					borderColor: token.colorBorderSecondary,
				}}
			>
				<SectionHeader
					icon={<SearchOutlined />}
					title={t("thirdPartyApi.section.search", "Web search", {
						ns: "settings",
					})}
					desc={t(
						"thirdPartyApi.section.searchDesc",
						"Configure third-party search providers so the assistant can fetch up-to-date information from the web.",
						{ ns: "settings" },
					)}
				/>
				<div className="mt-4">
					<SearchSettings embedded />
				</div>
			</section>

			{/* Security footer */}
			<div
				className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
				style={{
					background: token.colorFillQuaternary,
					color: token.colorTextTertiary,
				}}
			>
				<LockOutlined />
				<span>
					{t(
						"thirdPartyApi.securityNote",
						"All API keys are stored locally in your user data directory and are never transmitted to any third party except the provider you configured.",
						{ ns: "settings" },
					)}
				</span>
			</div>
		</div>
	);
};

interface ProviderCardProps {
	provider: ProviderDef;
	state: ProviderState;
	configured: boolean;
	dirty: boolean;
	loading: boolean;
	onChange: (value: string) => void;
	onToggleReveal: () => void;
	onCopy: () => void;
	onSave: () => void;
	onOpenDocs: () => void;
	onReset: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({
	provider,
	state,
	configured,
	dirty,
	loading,
	onChange,
	onToggleReveal,
	onCopy,
	onSave,
	onOpenDocs,
	onReset,
}) => {
	const { t } = useTranslation();
	const { token } = useToken();

	const statusPill = useMemo(() => {
		if (loading) {
			return (
				<span
					className="text-[11px] px-2 py-0.5 rounded-full"
					style={{
						background: token.colorFillSecondary,
						color: token.colorTextTertiary,
					}}
				>
					{t("thirdPartyApi.loading", "Loading…", { ns: "settings" })}
				</span>
			);
		}
		if (configured) {
			return (
				<span
					className="text-[11px] px-2 py-0.5 rounded-full inline-flex items-center gap-1"
					style={{
						background: `${token.colorSuccess}1a`,
						color: token.colorSuccess,
					}}
				>
					<CheckCircleFilled style={{ fontSize: 10 }} />
					{t("thirdPartyApi.configured", "Configured", { ns: "settings" })}
				</span>
			);
		}
		return (
			<span
				className="text-[11px] px-2 py-0.5 rounded-full"
				style={{
					background: token.colorFillTertiary,
					color: token.colorTextSecondary,
				}}
			>
				{t("thirdPartyApi.notConfigured", "Not configured", {
					ns: "settings",
				})}
			</span>
		);
	}, [loading, configured, token, t]);

	return (
		<section
			className="rounded-2xl border overflow-hidden transition-shadow"
			style={{
				background: token.colorBgContainer,
				borderColor: token.colorBorderSecondary,
			}}
		>
			{/* Card header row */}
			<div
				className="flex items-center gap-3 px-4 py-3"
				style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}
			>
				<div
					className="flex-none flex items-center justify-center rounded-xl font-semibold text-white"
					style={{
						width: 40,
						height: 40,
						background: `linear-gradient(135deg, ${provider.accent}, ${provider.accent}cc)`,
						fontSize: 13,
						letterSpacing: 0.5,
					}}
					aria-hidden="true"
				>
					{provider.avatar}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<h3
							className="text-sm font-semibold m-0 truncate"
							style={{ color: token.colorTextHeading }}
						>
							{t(provider.nameKey, provider.nameFallback, { ns: "settings" })}
						</h3>
						{statusPill}
					</div>
					<p
						className="text-xs mt-0.5 mb-0 truncate"
						style={{ color: token.colorTextSecondary }}
					>
						{t(provider.descKey, provider.descFallback, { ns: "settings" })}
					</p>
				</div>
			</div>

			{/* Card body */}
			<div className="px-4 py-4 space-y-3">
				<div>
					<label
						htmlFor={`${provider.id}-api-key`}
						className="block text-xs font-medium mb-1.5"
						style={{ color: token.colorText }}
					>
						{t("thirdPartyApi.apiKey", "API Key", { ns: "settings" })}
					</label>
					<Input
						id={`${provider.id}-api-key`}
						value={state.value}
						onChange={(e) => onChange(e.target.value)}
						placeholder={t(
							"thirdPartyApi.apiKeyPlaceholder",
							"Paste your API key here",
							{ ns: "settings" },
						)}
						type={state.revealed ? "text" : "password"}
						autoComplete="off"
						spellCheck={false}
						size="large"
						className="rounded-xl! font-mono"
						prefix={
							<KeyOutlined style={{ color: token.colorTextTertiary }} />
						}
						suffix={
							<span className="inline-flex items-center gap-1">
								<Tooltip
									title={
										state.revealed
											? t("thirdPartyApi.hide", "Hide", { ns: "settings" })
											: t("thirdPartyApi.reveal", "Reveal", { ns: "settings" })
									}
								>
									<Button
										type="text"
										size="small"
										icon={
											state.revealed ? (
												<EyeInvisibleOutlined />
											) : (
												<EyeOutlined />
											)
										}
										onClick={onToggleReveal}
										aria-label={
											state.revealed
												? t("thirdPartyApi.hide", "Hide", { ns: "settings" })
												: t("thirdPartyApi.reveal", "Reveal", {
														ns: "settings",
													})
										}
									/>
								</Tooltip>
								{state.value ? (
									<Tooltip
										title={t("thirdPartyApi.copy", "Copy", { ns: "settings" })}
									>
										<Button
											type="text"
											size="small"
											icon={<CopyOutlined />}
											onClick={onCopy}
											aria-label={t("thirdPartyApi.copy", "Copy", {
												ns: "settings",
											})}
										/>
									</Tooltip>
								) : null}
							</span>
						}
					/>
					<div className="flex items-center justify-between mt-2">
						<button
							type="button"
							onClick={onOpenDocs}
							className="inline-flex items-center gap-1 text-xs bg-transparent border-0 p-0 cursor-pointer transition-colors"
							style={{ color: token.colorTextSecondary }}
							onMouseEnter={(e) => {
								e.currentTarget.style.color = token.colorPrimary;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.color = token.colorTextSecondary;
							}}
						>
							<SafetyCertificateOutlined />
							<span>
								{t(
									"thirdPartyApi.getKeyFrom",
									"Get your API key from {{host}}",
									{ ns: "settings", host: provider.docsLabel },
								)}
							</span>
							<LinkOutlined style={{ fontSize: 10 }} />
						</button>
					</div>
				</div>

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 pt-2">
					<Button
						size="middle"
						onClick={onReset}
						disabled={!dirty || state.saving}
						className="rounded-lg!"
					>
						{t("thirdPartyApi.reset", "Reset", { ns: "settings" })}
					</Button>
					<Button
						type="primary"
						size="middle"
						icon={
							state.justSaved ? <CheckCircleFilled /> : <SaveOutlined />
						}
						onClick={onSave}
						loading={state.saving}
						disabled={!dirty && !state.justSaved}
						className="rounded-lg!"
					>
						{state.justSaved
							? t("thirdPartyApi.saved", "Saved", { ns: "settings" })
							: t("thirdPartyApi.save", "Save", { ns: "settings" })}
					</Button>
				</div>
			</div>
		</section>
	);
};

interface SectionHeaderProps {
	icon: React.ReactNode;
	title: string;
	desc: string;
}

/**
 * Small in-page heading used to introduce sub-sections of the third-party
 * API settings page ("API keys", "Web search"). Kept minimal on purpose —
 * the outer hero already carries the page-level context.
 */
const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, desc }) => {
	const { token } = useToken();
	return (
		<div className="flex items-start gap-2">
			<span
				className="flex-none inline-flex items-center justify-center rounded-lg"
				style={{
					width: 24,
					height: 24,
					background: token.colorFillTertiary,
					color: token.colorTextSecondary,
					fontSize: 12,
				}}
				aria-hidden="true"
			>
				{icon}
			</span>
			<div className="flex-1 min-w-0">
				<h3
					className="text-sm font-semibold m-0 leading-6"
					style={{ color: token.colorTextHeading }}
				>
					{title}
				</h3>
				<p
					className="text-xs mt-0.5 mb-0"
					style={{ color: token.colorTextTertiary }}
				>
					{desc}
				</p>
			</div>
		</div>
	);
};

export default ThirdPartyApiSettings;
