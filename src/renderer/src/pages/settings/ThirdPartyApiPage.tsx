import type React from "react";
import { ThirdPartyApiSettings } from "../../components/settings/ThirdPartyApiSettings";

/**
 * `/settings/third-party-api` — dedicated page for external service credentials
 * (SkillsMP, and future OpenRouter / Anthropic / relay providers). Kept apart
 * from `models` so the model catalog stays focused on model selection.
 */
const ThirdPartyApiPage: React.FC = () => (
	<div data-testid="third-party-api-content" className="pb-6">
		<ThirdPartyApiSettings />
	</div>
);

export default ThirdPartyApiPage;
