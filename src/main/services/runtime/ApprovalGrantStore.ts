/**
 * ApprovalGrantStore
 *
 * Owns the lookup/write semantics for session-scoped approval grants.
 * Thin layer over ConversationStorageService for read/write of
 * `session.approvalGrants` and over RuntimePolicyService for deny audits.
 *
 * Phase note: only "session" scope is fully implemented. "once" returns the
 * grant without persisting (caller consumes it immediately). "workspace" /
 * "global" are persisted as session-scoped for now (TODO below) until a
 * separate workspace/global settings surface is added.
 */

import { randomUUID } from "node:crypto";
import type {
	RuntimeOperationContext,
	SessionApprovalGrant,
} from "@super-client/shared-types/chat";

import { getSessionStorage } from "../storage/SessionStorageService";
import { getRuntimePolicyService } from "./RuntimePolicyService";

export interface GrantLookupKey {
	conversationId: string;
	operationType: string;
	target?: string;
}

export class ApprovalGrantStore {
	/**
	 * Returns the matching grant if one exists and has not expired.
	 * - "once" grants are NEVER returned (caller must remove after one use).
	 * - "session" grants match on operationType (+ target if grant.target set).
	 * - "workspace" / "global" grants treated as session-equivalent for now.
	 *   TODO(workspace-global-grants): once a workspace/global settings surface
	 *   exists, route those scopes through that store instead.
	 * - Expired grants are skipped AND removed from storage.
	 */
	findGrant(key: GrantLookupKey): SessionApprovalGrant | null {
		const grants = this.readGrants(key.conversationId);
		if (grants.length === 0) return null;

		const now = Date.now();
		const expiredIds: string[] = [];
		let match: SessionApprovalGrant | null = null;

		for (const grant of grants) {
			if (grant.expiresAt !== undefined && grant.expiresAt <= now) {
				expiredIds.push(grant.id);
				continue;
			}
			if (grant.scope === "once") continue;
			if (match) continue;
			if (grant.operationType !== key.operationType) continue;
			if (grant.target && grant.target !== key.target) continue;
			match = grant;
		}

		if (expiredIds.length > 0) {
			const remaining = grants.filter((g) => !expiredIds.includes(g.id));
			this.writeGrants(key.conversationId, remaining);
		}

		return match;
	}

	/**
	 * Adds a grant to the conversation's session.approvalGrants.
	 * - "once" scope: returns grant WITHOUT persisting.
	 * - "session"/"workspace"/"global": persists into conversation metadata.
	 *   TODO(workspace-global-grants): split workspace/global out of session.
	 */
	addGrant(
		conversationId: string,
		input: Omit<SessionApprovalGrant, "id" | "grantedAt">,
	): SessionApprovalGrant {
		const grant: SessionApprovalGrant = {
			...input,
			id: randomUUID(),
			grantedAt: Date.now(),
		};

		if (grant.scope === "once") {
			return grant;
		}

		const existing = this.readGrants(conversationId);
		this.writeGrants(conversationId, [...existing, grant]);
		return grant;
	}

	/**
	 * Records a denial in the runtime audit log.
	 * Does NOT persist anything to conversation metadata.
	 */
	recordDeny(
		conversationId: string,
		workspaceId: string,
		operationType: string,
		target?: string,
		reason?: string,
	): void {
		const ctx: RuntimeOperationContext = {
			workspaceId,
			sessionId: conversationId,
			source: "user",
			operation: operationType,
			kind: "tool-execute",
			target,
		};
		getRuntimePolicyService().record(ctx, "denied", reason);
	}

	/** Returns all (non-expired) grants for a conversation. */
	listGrants(conversationId: string): SessionApprovalGrant[] {
		const grants = this.readGrants(conversationId);
		const now = Date.now();
		const live: SessionApprovalGrant[] = [];
		const expiredIds: string[] = [];
		for (const grant of grants) {
			if (grant.expiresAt !== undefined && grant.expiresAt <= now) {
				expiredIds.push(grant.id);
				continue;
			}
			live.push(grant);
		}
		if (expiredIds.length > 0) {
			this.writeGrants(conversationId, live);
		}
		return live;
	}

	/** Removes a grant by id. Returns true if a grant was removed. */
	removeGrant(conversationId: string, grantId: string): boolean {
		const grants = this.readGrants(conversationId);
		const remaining = grants.filter((g) => g.id !== grantId);
		if (remaining.length === grants.length) return false;
		this.writeGrants(conversationId, remaining);
		return true;
	}

	/** Removes all expired grants from a conversation; returns count removed. */
	removeExpiredGrants(conversationId: string): number {
		const grants = this.readGrants(conversationId);
		const now = Date.now();
		const live = grants.filter(
			(g) => g.expiresAt === undefined || g.expiresAt > now,
		);
		const removed = grants.length - live.length;
		if (removed > 0) this.writeGrants(conversationId, live);
		return removed;
	}

	/** Removes all grants from a conversation. */
	clearGrants(conversationId: string): void {
		this.writeGrants(conversationId, []);
	}

	// ─── internal helpers ─────────────────────────

	private readGrants(conversationId: string): SessionApprovalGrant[] {
		try {
			const meta = getSessionStorage().getMeta(conversationId);
			return meta.approvalGrants ? [...meta.approvalGrants] : [];
		} catch {
			return [];
		}
	}

	private writeGrants(
		conversationId: string,
		grants: SessionApprovalGrant[],
	): void {
		try {
			getSessionStorage().updateMeta(conversationId, {
				approvalGrants: grants,
			});
		} catch (err) {
			// session 不存在或 meta 写失败：失败保留旧值，调用方自行处理
			void err;
		}
	}
}

let singleton: ApprovalGrantStore | null = null;

export function getApprovalGrantStore(): ApprovalGrantStore {
	if (!singleton) singleton = new ApprovalGrantStore();
	return singleton;
}
