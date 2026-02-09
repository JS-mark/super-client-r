import { Button, Result } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouteError } from "react-router-dom";

const ErrorPage: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const error: any = useRouteError();

	return (
		<div className="flex h-[600px] w-full items-center justify-center">
			<Result
				status="500"
				title={t("error.title")}
				subTitle={
					error?.statusText || error?.message || t("error.defaultMessage")
				}
				extra={
					<Button type="primary" onClick={() => navigate("/")}>
						{t("error.backHome")}
					</Button>
				}
			/>
		</div>
	);
};

export default ErrorPage;
