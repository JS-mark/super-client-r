import { describe, expect, it } from "vitest";
import {
	clearMessageModelOverrideAfterSend,
	findProviderModelInList,
	resolveRendererEffectiveModel,
	resolveRendererFallbackModel,
} from "../useMessageModelResolution";
import type { ActiveModelSelection, ModelProvider } from "../../types/models";

function provider(id: string, modelIds: string[]): ModelProvider {
	return {
		id,
		name: id,
		preset: "custom",
		baseUrl: "",
		apiKey: "",
		enabled: true,
		tested: false,
		createdAt: 1,
		updatedAt: 1,
		models: modelIds.map((modelId) => ({
			id: modelId,
			name: modelId,
			enabled: true,
			capabilities: [],
			category: "chat",
			supportsStreaming: true,
		})),
	};
}

const providers = [
	provider("message-provider", ["message-model"]),
	provider("session-provider", ["session-model"]),
	provider("project-provider", ["project-model"]),
	provider("global-provider", ["global-model"]),
];

describe("message model resolution helpers", () => {
	it("finds provider and model for a valid selection", () => {
		const found = findProviderModelInList(providers, {
			providerId: "session-provider",
			modelId: "session-model",
		});

		expect(found?.provider.id).toBe("session-provider");
		expect(found?.model.id).toBe("session-model");
	});

	it("returns undefined when provider or model is missing", () => {
		expect(
			findProviderModelInList(providers, {
				providerId: "missing-provider",
				modelId: "session-model",
			}),
		).toBeUndefined();
		expect(
			findProviderModelInList(providers, {
				providerId: "session-provider",
				modelId: "missing-model",
			}),
		).toBeUndefined();
	});

	it("prioritizes session override over project default and global active model", () => {
		const found = resolveRendererFallbackModel({
			providers,
			sessionModelOverride: {
				providerId: "session-provider",
				modelId: "session-model",
			},
			projectDefaultModel: {
				providerId: "project-provider",
				modelId: "project-model",
			},
			activeSelection: {
				providerId: "global-provider",
				modelId: "global-model",
			},
		});

		expect(found?.provider.id).toBe("session-provider");
		expect(found?.model.id).toBe("session-model");
	});

	it("prioritizes one-shot message override and exposes the effective source", () => {
		const found = resolveRendererEffectiveModel({
			providers,
			messageModelOverride: {
				providerId: "message-provider",
				modelId: "message-model",
			},
			sessionModelOverride: {
				providerId: "session-provider",
				modelId: "session-model",
			},
			projectDefaultModel: {
				providerId: "project-provider",
				modelId: "project-model",
			},
			activeSelection: {
				providerId: "global-provider",
				modelId: "global-model",
			},
		});

		expect(found?.provider.id).toBe("message-provider");
		expect(found?.model.id).toBe("message-model");
		expect(found?.source).toBe("message");
		expect(found?.sourceLabel).toBe("本次使用");
	});

	it("keeps session override as the effective source when no message override exists", () => {
		const found = resolveRendererEffectiveModel({
			providers,
			messageModelOverride: null,
			sessionModelOverride: {
				providerId: "session-provider",
				modelId: "session-model",
			},
			projectDefaultModel: {
				providerId: "project-provider",
				modelId: "project-model",
			},
			activeSelection: {
				providerId: "global-provider",
				modelId: "global-model",
			},
		});

		expect(found?.provider.id).toBe("session-provider");
		expect(found?.source).toBe("session");
		expect(found?.sourceLabel).toBe("会话覆盖");
	});

	it("clears only the one-shot message override after send", () => {
		let nextMessageOverride: ActiveModelSelection | null = {
			providerId: "message-provider",
			modelId: "message-model",
		};
		const sessionOverride = {
			providerId: "session-provider",
			modelId: "session-model",
		};

		clearMessageModelOverrideAfterSend(nextMessageOverride, (selection) => {
			nextMessageOverride = selection;
		});

		expect(nextMessageOverride).toBeNull();
		expect(sessionOverride).toEqual({
			providerId: "session-provider",
			modelId: "session-model",
		});
	});

	it("falls through missing session and project selections to the active model", () => {
		const found = resolveRendererFallbackModel({
			providers,
			sessionModelOverride: {
				providerId: "session-provider",
				modelId: "missing-model",
			},
			projectDefaultModel: {
				providerId: "missing-project-provider",
				modelId: "project-model",
			},
			activeSelection: {
				providerId: "global-provider",
				modelId: "global-model",
			},
		});

		expect(found?.provider.id).toBe("global-provider");
		expect(found?.model.id).toBe("global-model");
	});

	it("returns undefined when no valid selection exists", () => {
		expect(
			resolveRendererFallbackModel({
				providers,
				sessionModelOverride: null,
				projectDefaultModel: undefined,
				activeSelection: null,
			}),
		).toBeUndefined();
	});
});
