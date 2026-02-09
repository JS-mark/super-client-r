import crypto from "crypto";
import type { Context, Next } from "koa";
import { SERVER_CONFIG } from "../config";

export const authMiddleware = async (ctx: Context, next: Next) => {
	const signature = ctx.headers["x-signature"] as string;
	const timestamp = ctx.headers["x-timestamp"] as string;

	if (signature && timestamp) {
		// Verify signature: HMAC-SHA256(timestamp + body, secret)
		const body = JSON.stringify(ctx.request.body || {});
		const payload = `${timestamp}.${body}`;
		const expectedSignature = crypto
			.createHmac("sha256", SERVER_CONFIG.SHARED_SECRET)
			.update(payload)
			.digest("hex");

		if (signature !== expectedSignature) {
			console.warn("Invalid signature");
			// ctx.throw(401, 'Invalid signature') // Uncomment to enforce
		}
	}

	await next();
};
