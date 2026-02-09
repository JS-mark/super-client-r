/**
 * Auth Tests - JWT Authentication and API Key Management
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
	ApiKeyManager,
	generateToken,
	verifyToken,
	Permissions,
} from "./auth";

describe("Auth Module", () => {
	describe("ApiKeyManager", () => {
		let manager: ApiKeyManager;

		beforeEach(() => {
			manager = new ApiKeyManager();
		});

		it("should generate a new API key", () => {
			const result = manager.generateApiKey("Test Key");

			expect(result.apiKey).toBeDefined();
			expect(result.apiKey).toMatch(/^sk_[a-f0-9]+_[a-f0-9]{64}$/);
			expect(result.apiKeyData.name).toBe("Test Key");
			expect(result.apiKeyData.enabled).toBe(true);
			expect(result.apiKeyData.permissions).toContain("chat:write");
			expect(result.apiKeyData.permissions).toContain("agent:execute");
		});

		it("should generate API key with custom options", () => {
			const result = manager.generateApiKey("Custom Key", {
				expiresInDays: 30,
				permissions: ["admin"],
				usageLimit: 1000,
			});

			expect(result.apiKeyData.permissions).toContain("admin");
			expect(result.apiKeyData.expiresAt).toBeDefined();
			expect(result.apiKeyData.usageLimit).toBe(1000);
		});

		it("should validate a valid API key", () => {
			const { apiKey, apiKeyData } = manager.generateApiKey("Test Key");
			const validated = manager.validateApiKey(apiKey);

			expect(validated).not.toBeNull();
			expect(validated?.id).toBe(apiKeyData.id);
			expect(validated?.name).toBe("Test Key");
		});

		it("should return null for invalid API key", () => {
			const result = manager.validateApiKey("invalid_key");
			expect(result).toBeNull();
		});

		it("should return null for disabled API key", () => {
			const { apiKey, apiKeyData } = manager.generateApiKey("Test Key");
			manager.toggleApiKey(apiKeyData.id, false);

			const validated = manager.validateApiKey(apiKey);
			expect(validated).toBeNull();
		});

		it("should return null for expired API key", () => {
			const { apiKey, apiKeyData } = manager.generateApiKey("Test Key", {
				expiresInDays: -1, // Expired yesterday
			});

			const validated = manager.validateApiKey(apiKey);
			expect(validated).toBeNull();
		});

		it("should return null when usage limit exceeded", () => {
			const { apiKey, apiKeyData } = manager.generateApiKey("Test Key", {
				usageLimit: 2,
			});

			manager.incrementUsage(apiKeyData.id);
			manager.incrementUsage(apiKeyData.id);

			const validated = manager.validateApiKey(apiKey);
			expect(validated).toBeNull();
		});

		it("should list all API keys without hashes", () => {
			manager.generateApiKey("Key 1");
			manager.generateApiKey("Key 2");

			const keys = manager.listApiKeys();
			expect(keys).toHaveLength(2);
			expect(keys[0].keyHash).toBe("");
			expect(keys[1].keyHash).toBe("");
		});

		it("should revoke API key", () => {
			const { apiKeyData } = manager.generateApiKey("Test Key");
			const revoked = manager.revokeApiKey(apiKeyData.id);

			expect(revoked).toBe(true);
			expect(manager.getApiKey(apiKeyData.id)).toBeUndefined();
		});

		it("should update API key", () => {
			const { apiKeyData } = manager.generateApiKey("Test Key");
			const updated = manager.updateApiKey(apiKeyData.id, {
				name: "Updated Name",
				permissions: ["admin"],
			});

			expect(updated).toBe(true);
			const key = manager.getApiKey(apiKeyData.id);
			expect(key?.name).toBe("Updated Name");
			expect(key?.permissions).toContain("admin");
		});

		it("should increment usage count", () => {
			const { apiKeyData } = manager.generateApiKey("Test Key");

			manager.incrementUsage(apiKeyData.id);
			expect(manager.getApiKey(apiKeyData.id)?.usageCount).toBe(1);

			manager.incrementUsage(apiKeyData.id);
			expect(manager.getApiKey(apiKeyData.id)?.usageCount).toBe(2);
		});
	});

	describe("JWT Token", () => {
		it("should generate a valid JWT token", () => {
			const apiKey = {
				id: "key_123",
				name: "Test Key",
				keyPrefix: "sk_test",
				keyHash: "hash",
				createdAt: Date.now(),
				permissions: ["chat:write"],
				enabled: true,
				usageCount: 0,
			};

			const token = generateToken(apiKey);
			expect(token).toBeDefined();
			expect(token.split(".")).toHaveLength(3); // header.payload.signature
		});

		it("should verify a valid token", () => {
			const apiKey = {
				id: "key_123",
				name: "Test Key",
				keyPrefix: "sk_test",
				keyHash: "hash",
				createdAt: Date.now(),
				permissions: ["chat:write", "agent:execute"],
				enabled: true,
				usageCount: 0,
			};

			const token = generateToken(apiKey);
			const payload = verifyToken(token);

			expect(payload).not.toBeNull();
			expect(payload?.sub).toBe("key_123");
			expect(payload?.name).toBe("Test Key");
			expect(payload?.permissions).toContain("chat:write");
		});

		it("should return null for invalid token", () => {
			const payload = verifyToken("invalid.token.signature");
			expect(payload).toBeNull();
		});

		it("should return null for malformed token", () => {
			const payload = verifyToken("not-a-valid-token");
			expect(payload).toBeNull();
		});

		it("should include correct issuer and audience", () => {
			const apiKey = {
				id: "key_123",
				name: "Test Key",
				keyPrefix: "sk_test",
				keyHash: "hash",
				createdAt: Date.now(),
				permissions: [],
				enabled: true,
				usageCount: 0,
			};

			const token = generateToken(apiKey);
			const payload = verifyToken(token);

			expect(payload?.iss).toBe("super-client-r");
			expect(payload?.aud).toBe("super-client-r-api");
		});
	});

	describe("Permissions", () => {
		it("should have all required permission constants", () => {
			expect(Permissions.CHAT_READ).toBe("chat:read");
			expect(Permissions.CHAT_WRITE).toBe("chat:write");
			expect(Permissions.AGENT_EXECUTE).toBe("agent:execute");
			expect(Permissions.MCP_EXECUTE).toBe("mcp:execute");
			expect(Permissions.SKILL_EXECUTE).toBe("skill:execute");
			expect(Permissions.ADMIN).toBe("admin");
		});
	});
});
