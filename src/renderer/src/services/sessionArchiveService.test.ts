import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionArchiveService } from "./sessionArchiveService";

describe("sessionArchiveService", () => {
	const exportArchive = vi.fn();

	beforeEach(() => {
		exportArchive.mockReset();
		exportArchive.mockResolvedValue({ success: true, data: null });
		const currentElectron = window.electron as
			| (typeof window.electron & {
					sessions?: Record<string, unknown>;
			  })
			| undefined;
		Object.defineProperty(window, "electron", {
			value: {
				...currentElectron,
				sessions: {
					...currentElectron?.sessions,
					exportArchive,
				},
			},
			configurable: true,
		});
	});

	it("passes only the session id to the sessions bridge", async () => {
		await sessionArchiveService.exportArchive("session-1");

		expect(exportArchive).toHaveBeenCalledTimes(1);
		expect(exportArchive).toHaveBeenCalledWith("session-1");
	});
});
