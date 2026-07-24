/**
 * Error Boundary Component
 * Catches JavaScript errors in child component trees
 */

import { Button, Result } from "antd";
import i18n from "i18next";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "../services/logService";

const log = createLogger("ErrorBoundary");

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
		};
	}

	static getDerivedStateFromError(error: Error): State {
		return {
			hasError: true,
			error,
			errorInfo: null,
		};
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		this.setState({
			error,
			errorInfo,
		});

		// Call custom error handler if provided
		this.props.onError?.(error, errorInfo);

		// Log the caught error through the renderer logger
		log.error("ErrorBoundary caught an error", error, {
			componentStack: errorInfo.componentStack,
		});
	}

	handleReset = (): void => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		});
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// Use custom fallback if provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			const t = i18n.t.bind(i18n);

			// Default error UI
			return (
				<div className="flex items-center justify-center min-h-screen p-4 bg-[var(--ant-color-bg-base)]">
					<Result
						status="error"
						title={t("somethingWentWrong", { ns: "error" })}
						subTitle={
							this.state.error?.message || t("unexpectedError", { ns: "error" })
						}
						extra={[
							<Button type="primary" key="retry" onClick={this.handleReset}>
								{t("tryAgain", { ns: "error" })}
							</Button>,
							<Button key="reload" onClick={() => window.location.reload()}>
								{t("reloadPage", { ns: "error" })}
							</Button>,
						]}
					/>
				</div>
			);
		}

		return this.props.children;
	}
}
