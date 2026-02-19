/**
 * JWT Authentication and API Key Management
 * Uses native crypto module to avoid external dependencies
 */

import crypto from "crypto";
import type { Context, Next } from "koa";

// JWT 配置
const JWT_CONFIG = {
	secret: process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex"),
	issuer: "super-client-r",
	audience: "super-client-r-api",
	expiresIn: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

// API Key 接口
export interface ApiKey {
	id: string;
	name: string;
	keyPrefix: string;
	keyHash: string;
	createdAt: number;
	expiresAt?: number;
	lastUsedAt?: number;
	permissions: string[];
	enabled: boolean;
	usageCount: number;
	usageLimit?: number;
}

// JWT Payload 接口
export interface JwtPayload {
	sub: string; // API Key ID
	name: string;
	permissions: string[];
	iat: number;
	exp: number;
	iss: string;
	aud: string;
}

// API Key 管理器
export class ApiKeyManager {
	private apiKeys: Map<string, ApiKey> = new Map();

	/**
	 * Generate a new API Key
	 */
	generateApiKey(
		name: string,
		options: {
			expiresInDays?: number;
			permissions?: string[];
			usageLimit?: number;
		} = {},
	): { apiKey: string; apiKeyData: ApiKey } {
		const id = `key_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
		const keyPrefix = `sk_${crypto.randomBytes(4).toString("hex")}`;
		const keySecret = crypto.randomBytes(32).toString("hex");
		const fullKey = `${keyPrefix}_${keySecret}`;

		// Store only the hash
		const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");

		const apiKeyData: ApiKey = {
			id,
			name,
			keyPrefix: `${keyPrefix.slice(0, 8)}...`,
			keyHash,
			createdAt: Date.now(),
			expiresAt: options.expiresInDays
				? Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000
				: undefined,
			permissions: options.permissions || ["chat:write", "agent:execute"],
			enabled: true,
			usageCount: 0,
			usageLimit: options.usageLimit,
		};

		this.apiKeys.set(id, apiKeyData);

		return { apiKey: fullKey, apiKeyData };
	}

	/**
	 * Validate an API Key
	 */
	validateApiKey(apiKey: string): ApiKey | null {
		const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

		for (const [_, apiKeyData] of this.apiKeys) {
			if (apiKeyData.keyHash === keyHash) {
				// Check if enabled
				if (!apiKeyData.enabled) {
					return null;
				}

				// Check expiration
				if (apiKeyData.expiresAt && Date.now() > apiKeyData.expiresAt) {
					return null;
				}

				// Check usage limit
				if (
					apiKeyData.usageLimit !== undefined &&
					apiKeyData.usageCount >= apiKeyData.usageLimit
				) {
					return null;
				}

				return apiKeyData;
			}
		}

		return null;
	}

	/**
	 * Increment usage count
	 */
	incrementUsage(id: string): void {
		const apiKey = this.apiKeys.get(id);
		if (apiKey) {
			apiKey.usageCount++;
			apiKey.lastUsedAt = Date.now();
		}
	}

	/**
	 * Get API Key by ID
	 */
	getApiKey(id: string): ApiKey | undefined {
		const apiKey = this.apiKeys.get(id);
		if (apiKey) {
			// Return without hash for security
			const { keyHash: _keyHash, ...safeApiKey } = apiKey;
			return { ...safeApiKey, keyHash: "" } as ApiKey;
		}
		return undefined;
	}

	/**
	 * List all API Keys (safe version without hashes)
	 */
	listApiKeys(): Omit<ApiKey, "keyHash">[] {
		return Array.from(this.apiKeys.values()).map((apiKey) => {
			const { keyHash: _, ...safeApiKey } = apiKey;
			return safeApiKey;
		});
	}

	/**
	 * Revoke API Key
	 */
	revokeApiKey(id: string): boolean {
		return this.apiKeys.delete(id);
	}

	/**
	 * Enable/Disable API Key
	 */
	toggleApiKey(id: string, enabled: boolean): boolean {
		const apiKey = this.apiKeys.get(id);
		if (apiKey) {
			apiKey.enabled = enabled;
			return true;
		}
		return false;
	}

	/**
	 * Update API Key
	 */
	updateApiKey(
		id: string,
		updates: Partial<Pick<ApiKey, "name" | "permissions" | "usageLimit">>,
	): boolean {
		const apiKey = this.apiKeys.get(id);
		if (apiKey) {
			Object.assign(apiKey, updates);
			return true;
		}
		return false;
	}
}

// 导出单例
export const apiKeyManager = new ApiKeyManager();

/**
 * Generate JWT Token using HMAC-SHA256
 */
export function generateToken(apiKey: ApiKey): string {
	const header = {
		alg: "HS256",
		typ: "JWT",
	};

	const now = Math.floor(Date.now() / 1000);
	const payload: JwtPayload = {
		sub: apiKey.id,
		name: apiKey.name,
		permissions: apiKey.permissions,
		iat: now,
		exp: now + Math.floor(JWT_CONFIG.expiresIn / 1000),
		iss: JWT_CONFIG.issuer,
		aud: JWT_CONFIG.audience,
	};

	const headerB64 = Buffer.from(JSON.stringify(header))
		.toString("base64url");
	const payloadB64 = Buffer.from(JSON.stringify(payload))
		.toString("base64url");

	const signature = crypto
		.createHmac("sha256", JWT_CONFIG.secret)
		.update(`${headerB64}.${payloadB64}`)
		.digest("base64url");

	return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify JWT Token
 */
export function verifyToken(token: string): JwtPayload | null {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		const [headerB64, payloadB64, signature] = parts;

		// Verify signature
		const expectedSignature = crypto
			.createHmac("sha256", JWT_CONFIG.secret)
			.update(`${headerB64}.${payloadB64}`)
			.digest("base64url");

		if (signature !== expectedSignature) {
			return null;
		}

		// Parse payload
		const payload = JSON.parse(
			Buffer.from(payloadB64, "base64url").toString(),
		) as JwtPayload;

		// Check expiration
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp && payload.exp < now) {
			return null;
		}

		// Check issuer and audience
		if (payload.iss !== JWT_CONFIG.issuer || payload.aud !== JWT_CONFIG.audience) {
			return null;
		}

		return payload;
	} catch {
		return null;
	}
}

/**
 * JWT Middleware for Koa
 */
export async function jwtMiddleware(ctx: Context, next: Next) {
	// Get token from Authorization header
	const authHeader = ctx.headers.authorization;
	let token: string | undefined;

	if (authHeader) {
		const parts = authHeader.split(" ");
		if (parts.length === 2 && parts[0] === "Bearer") {
			token = parts[1];
		}
	}

	// Also check query parameter for WebSocket support
	if (!token && ctx.query.token) {
		token = String(ctx.query.token);
	}

	if (!token) {
		ctx.status = 401;
		ctx.body = { error: "No token provided" };
		return;
	}

	// Try JWT first
	const decoded = verifyToken(token);
	if (decoded) {
		// Check if API key still exists and is enabled
		const apiKey = apiKeyManager.getApiKey(decoded.sub);
		if (!apiKey || !apiKey.enabled) {
			ctx.status = 401;
			ctx.body = { error: "API key revoked or disabled" };
			return;
		}

		// Attach user info to context
		ctx.state.user = decoded;
		apiKeyManager.incrementUsage(decoded.sub);
		await next();
		return;
	}

	// Try API Key
	const apiKey = apiKeyManager.validateApiKey(token);
	if (apiKey) {
		// Attach user info to context
		ctx.state.user = {
			sub: apiKey.id,
			name: apiKey.name,
			permissions: apiKey.permissions,
			iat: Math.floor(Date.now() / 1000),
			exp: Math.floor(Date.now() / 1000) + Math.floor(JWT_CONFIG.expiresIn / 1000),
			iss: JWT_CONFIG.issuer,
			aud: JWT_CONFIG.audience,
		};
		apiKeyManager.incrementUsage(apiKey.id);
		await next();
		return;
	}

	ctx.status = 401;
	ctx.body = { error: "Invalid token or API key" };
}

/**
 * Permission Check Middleware
 */
export function requirePermission(...permissions: string[]) {
	return async (ctx: Context, next: Next) => {
		const user = ctx.state.user as JwtPayload | undefined;

		if (!user) {
			ctx.status = 401;
			ctx.body = { error: "Authentication required" };
			return;
		}

		const hasPermission = permissions.some(
			(p) => user.permissions.includes(p) || user.permissions.includes("admin"),
		);

		if (!hasPermission) {
			ctx.status = 403;
			ctx.body = { error: "Insufficient permissions" };
			return;
		}

		await next();
	};
}

/**
 * Optional Auth Middleware (allows both authenticated and anonymous)
 */
export async function optionalAuthMiddleware(ctx: Context, next: Next) {
	const authHeader = ctx.headers.authorization;

	if (authHeader) {
		const parts = authHeader.split(" ");
		if (parts.length === 2 && parts[0] === "Bearer") {
			const token = parts[1];
			const decoded = verifyToken(token);
			if (decoded) {
				ctx.state.user = decoded;
			}
		}
	}

	await next();
}

// Permission constants
export const Permissions = {
	CHAT_READ: "chat:read",
	CHAT_WRITE: "chat:write",
	AGENT_EXECUTE: "agent:execute",
	MCP_EXECUTE: "mcp:execute",
	SKILL_EXECUTE: "skill:execute",
	ADMIN: "admin",
} as const;

// Default export
export default {
	apiKeyManager,
	generateToken,
	verifyToken,
	jwtMiddleware,
	requirePermission,
	optionalAuthMiddleware,
	Permissions,
};
