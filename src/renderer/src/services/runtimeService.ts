import type {
	EffectiveSessionRuntime,
	IPCResponse,
	ResolveSessionRuntimeInput,
	RuntimeAuditEntry,
	SessionApprovalGrant,
} from "../types/electron";

export const runtimeService = {
	resolveSession: (
		input: ResolveSessionRuntimeInput,
	): Promise<IPCResponse<EffectiveSessionRuntime>> =>
		window.electron.runtime.resolveSession(input),

	getAuditLog: (limit?: number): Promise<IPCResponse<RuntimeAuditEntry[]>> =>
		window.electron.runtime.getAuditLog(limit),

	clearAuditLog: (): Promise<IPCResponse<boolean>> =>
		window.electron.runtime.clearAuditLog(),

	findGrant: (
		conversationId: string,
		operationType: string,
		target?: string,
	): Promise<IPCResponse<SessionApprovalGrant | null>> =>
		window.electron.runtime.findGrant(conversationId, operationType, target),

	addGrant: (
		conversationId: string,
		input: Omit<SessionApprovalGrant, "id" | "grantedAt">,
	): Promise<IPCResponse<SessionApprovalGrant>> =>
		window.electron.runtime.addGrant(conversationId, input),

	listGrants: (
		conversationId: string,
	): Promise<IPCResponse<SessionApprovalGrant[]>> =>
		window.electron.runtime.listGrants(conversationId),

	removeGrant: (
		conversationId: string,
		grantId: string,
	): Promise<IPCResponse<boolean>> =>
		window.electron.runtime.removeGrant(conversationId, grantId),

	recordDeny: (
		conversationId: string,
		workspaceId: string,
		operationType: string,
		target?: string,
		reason?: string,
	): Promise<IPCResponse<boolean>> =>
		window.electron.runtime.recordDeny(
			conversationId,
			workspaceId,
			operationType,
			target,
			reason,
		),

	clearGrants: (conversationId: string): Promise<IPCResponse<boolean>> =>
		window.electron.runtime.clearGrants(conversationId),
};
