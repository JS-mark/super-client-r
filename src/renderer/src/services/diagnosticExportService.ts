import type { DiagnosticExportResult, IPCResponse } from "../types/electron";

export const diagnosticExportService = {
	export: (): Promise<IPCResponse<DiagnosticExportResult>> =>
		window.electron.diagnostics.export(),
};
