import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionArchiveService } from "./sessionArchiveService";

describe("sessionArchiveService", () => {
	const exportArchive = vi.fn();
	const exportProjectArchive = vi.fn();

	beforeEach(() => {
		exportArchive.mockReset();
		exportProjectArchive.mockReset();
		exportArchive.mockResolvedValue({ success: true, data: null });
		exportProjectArchive.mockResolvedValue({ success: true, data: null });
		const currentElectron = window.electron as
			| (typeof window.electron & {
					sessions?: Record<string, unknown>;
					projects?: Record<string, unknown>;
			  })
			| undefined;
		Object.defineProperty(window, "electron", {
			value: {
				...currentElectron,
				projects: {
					...currentElectron?.projects,
					exportArchive: exportProjectArchive,
				},
				sessions: {
					...currentElectron?.sessions,
					exportArchive,
				},
			},
			configurable: true,
		});
	});

	it("passes the session id to the sessions bridge by default", async () => {
		await sessionArchiveService.exportArchive("session-1");

		expect(exportArchive).toHaveBeenCalledTimes(1);
		expect(exportArchive).toHaveBeenCalledWith("session-1", undefined);
	});

	it("passes includeChatContent when explicitly requested for sessions", async () => {
		await sessionArchiveService.exportArchive("session-1", {
			includeChatContent: true,
		});

		expect(exportArchive).toHaveBeenCalledWith("session-1", {
			includeChatContent: true,
		});
	});

	it("passes the project id to the projects bridge by default", async () => {
		await sessionArchiveService.exportProjectArchive("project-1");

		expect(exportProjectArchive).toHaveBeenCalledTimes(1);
		expect(exportProjectArchive).toHaveBeenCalledWith("project-1", undefined);
	});

	it("passes includeChatContent when explicitly requested for projects", async () => {
		await sessionArchiveService.exportProjectArchive("project-1", {
			includeChatContent: true,
		});

		expect(exportProjectArchive).toHaveBeenCalledWith("project-1", {
			includeChatContent: true,
		});
	});
});
