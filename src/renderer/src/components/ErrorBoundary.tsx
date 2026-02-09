/**
 * Error Boundary Component
 * Catches JavaScript errors in child component trees
 */

import type * as React from "react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, Result } from "antd";

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

		// Log error to console
		console.error("ErrorBoundary caught an error:", error, errorInfo);
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

			// Default error UI
			return (
				<div className="flex items-center justify-center min-h-screen p-4">
					<Result
						status="error"
						title="Something went wrong"
						subTitle={
							this.state.error?.message ||
							"An unexpected error occurred"
						}
						extra={[
							<Button type="primary" key="retry" onClick={this.handleReset}>
								Try Again
							</Button>,
							<Button
								key="reload"
								onClick={() => window.location.reload()}
							>
								Reload Page
							</Button>,
						]}
					/>
				</div>
			);
		}

		return this.props.children;
	}
}