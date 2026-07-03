// @vitest-environment node

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ElectronAPIMigrated } from "@super-client/shared-types/electron-api";

vi.mock("electron", () => ({
	ipcMain: {
		handle: vi.fn(),
		removeHandler: vi.fn(),
	},
}));

import { toChannel } from "../register";

describe("session archive IPC API", () => {
	it("maps exportArchive to the sessions bridge channel", () => {
		expect(toChannel("sessions", "exportArchive")).toBe(
			"sessions:export-archive",
		);
	});

	it("does not include an output path argument in the shared contract", () => {
		type ExportArchiveArgs = Parameters<
			ElectronAPIMigrated["sessions"]["exportArchive"]
		>;

		expectTypeOf<ExportArchiveArgs>().toEqualTypeOf<[string]>();
	});
});
