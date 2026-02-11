import { Button, Result } from "antd";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useRouteError } from "react-router-dom";

const ErrorPage: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const error: any = useRouteError();

	return (
		<div className="flex h-full w-full items-center justify-center">
			<Result
				status="500"
				title={t("title", "Something went wrong", { ns: "error" })}
				subTitle={
					error?.statusText || error?.message || t("defaultMessage")
				}
				extra={
					<Button type="primary" onClick={() => navigate("/")}>
						{t("backHome", "Back Home", { ns: "error" })}
					</Button>
				}
			/>
		</div>
	);
};

export default ErrorPage;
