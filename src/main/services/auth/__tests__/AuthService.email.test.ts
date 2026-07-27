// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { storeMock } = vi.hoisted(() => ({
	storeMock: {
		config: new Map<string, unknown>(),
		setConfig: vi.fn(),
		getConfig: vi.fn(),
	},
}));

vi.mock("electron", () => ({
	BrowserWindow: class {},
}));

vi.mock("../../../store/StoreManager", () => ({
	storeManager: {
		setConfig: (key: string, value: unknown) => storeMock.setConfig(key, value),
		getConfig: (key: string) => storeMock.getConfig(key),
	},
}));

vi.mock("../../../utils/logger", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		debug: vi.fn(),
	},
}));

import { AuthService } from "../AuthService";

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		json: async () => body,
		text: async () => JSON.stringify(body),
	} as unknown as Response;
}

describe("AuthService email login", () => {
	let service: AuthService;
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		service = new AuthService();
		storeMock.setConfig.mockClear();
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe("sendEmailCode", () => {
		it("posts to /api/email/code with purpose login and returns result", async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ success: true, message: "sent" }),
			);

			const result = await service.sendEmailCode("User@Example.com");

			expect(result).toEqual({ success: true, message: "sent" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toContain("/api/email/code");
			expect(JSON.parse((init as RequestInit).body as string)).toEqual({
				email: "user@example.com",
				purpose: "login",
			});
		});

		it("rejects invalid email without calling fetch", async () => {
			await expect(service.sendEmailCode("not-an-email")).rejects.toThrow(
				"Invalid email address",
			);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("throws when backend responds non-ok", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ error: "x" }, false));
			await expect(service.sendEmailCode("a@b.com")).rejects.toThrow(
				"Failed to send verification code",
			);
		});
	});

	describe("loginWithEmail", () => {
		it("builds an email authUser and persists it when code is valid", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ valid: true }));

			const user = await service.loginWithEmail("User@Example.com", "123456");

			expect(user).toEqual({
				id: "email_user@example.com",
				name: "user@example.com",
				email: "user@example.com",
				provider: "email",
			});
			expect(storeMock.setConfig).toHaveBeenCalledWith("authUser", user);
			expect(storeMock.setConfig).toHaveBeenCalledWith("authTokens", {});

			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toContain("/api/email/code/verify");
			expect(JSON.parse((init as RequestInit).body as string)).toEqual({
				email: "user@example.com",
				code: "123456",
				purpose: "login",
			});
		});

		it("throws and does not persist when code is invalid", async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ valid: false }));

			await expect(
				service.loginWithEmail("a@b.com", "000000"),
			).rejects.toThrow("Invalid or expired verification code");
			expect(storeMock.setConfig).not.toHaveBeenCalled();
		});

		it("rejects empty code without calling fetch", async () => {
			await expect(service.loginWithEmail("a@b.com", "  ")).rejects.toThrow(
				"Verification code is required",
			);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("rejects invalid email without calling fetch", async () => {
			await expect(service.loginWithEmail("bad", "123456")).rejects.toThrow(
				"Invalid email address",
			);
			expect(fetchMock).not.toHaveBeenCalled();
		});
	});
});
