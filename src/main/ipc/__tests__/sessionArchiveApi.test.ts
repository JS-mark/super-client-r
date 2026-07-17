// @vitest-environment node

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
	ElectronAPIMigrated,
	SessionArchiveExportOptions,
} from "@super-client/shared-types/electron-api";

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

	it("maps exportArchive to the projects bridge channel", () => {
		expect(toChannel("projects", "exportArchive")).toBe(
			"projects:export-archive",
		);
	});

	it("only allows session id plus privacy options in the session contract", () => {
		type ExportArchiveArgs = Parameters<
			ElectronAPIMigrated["sessions"]["exportArchive"]
		>;

		expectTypeOf<ExportArchiveArgs>().toEqualTypeOf<
			[string, SessionArchiveExportOptions?]
		>();
	});

	it("only allows project id plus privacy options in the project contract", () => {
		type ExportArchiveArgs = Parameters<
			ElectronAPIMigrated["projects"]["exportArchive"]
		>;

		expectTypeOf<ExportArchiveArgs>().toEqualTypeOf<
			[string, SessionArchiveExportOptions?]
		>();
	});
});
