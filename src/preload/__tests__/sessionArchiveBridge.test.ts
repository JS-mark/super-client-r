// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const exposed: Record<string, unknown> = {};
const invoke = vi.fn();

vi.mock("electron", () => ({
	contextBridge: {
		exposeInMainWorld: vi.fn((name: string, value: unknown) => {
			exposed[name] = value;
		}),
	},
	ipcRenderer: {
		invoke,
		on: vi.fn(),
		off: vi.fn(),
	},
}));

describe("session archive preload bridge", () => {
	beforeEach(async () => {
		vi.resetModules();
		invoke.mockReset();
		for (const key of Object.keys(exposed)) {
			delete exposed[key];
		}
		await import("../index");
	});

	it("exposes sessions.exportArchive on the auto bridge", async () => {
		invoke.mockResolvedValue({ success: true, data: null });

		const electron = exposed.electron as {
			sessions: {
				exportArchive: (
					sessionId: string,
					options?: { includeChatContent?: boolean },
				) => Promise<unknown>;
			};
		};

		await electron.sessions.exportArchive("session-1", {
			includeChatContent: true,
		});

		expect(invoke).toHaveBeenCalledWith(
			"sessions:export-archive",
			"session-1",
			{ includeChatContent: true },
		);
	});

	it("exposes projects.exportArchive on the auto bridge", async () => {
		invoke.mockResolvedValue({ success: true, data: null });

		const electron = exposed.electron as {
			projects: {
				exportArchive: (
					projectId: string,
					options?: { includeChatContent?: boolean },
				) => Promise<unknown>;
			};
		};

		await electron.projects.exportArchive("project-1", {
			includeChatContent: true,
		});

		expect(invoke).toHaveBeenCalledWith(
			"projects:export-archive",
			"project-1",
			{ includeChatContent: true },
		);
	});

	it("exposes diagnostics.export without renderer-provided paths", async () => {
		invoke.mockResolvedValue({ success: true, data: null });

		const electron = exposed.electron as {
			diagnostics: { export: () => Promise<unknown> };
		};

		await electron.diagnostics.export();

		expect(invoke).toHaveBeenCalledWith("diagnostics:export");
	});
});
