import { beforeEach, describe, expect, it, vi } from "vitest";

import { diagnosticExportService } from "./diagnosticExportService";

describe("diagnosticExportService", () => {
	const exportDiagnostics = vi.fn();

	beforeEach(() => {
		exportDiagnostics.mockReset();
		exportDiagnostics.mockResolvedValue({ success: true, data: null });
		const currentElectron = window.electron as
			| (typeof window.electron & {
					diagnostics?: Record<string, unknown>;
			  })
			| undefined;
		Object.defineProperty(window, "electron", {
			value: {
				...currentElectron,
				diagnostics: {
					...currentElectron?.diagnostics,
					export: exportDiagnostics,
				},
			},
			configurable: true,
		});
	});

	it("calls the diagnostics bridge without renderer-provided paths", async () => {
		await diagnosticExportService.export();

		expect(exportDiagnostics).toHaveBeenCalledTimes(1);
		expect(exportDiagnostics).toHaveBeenCalledWith();
	});
});
