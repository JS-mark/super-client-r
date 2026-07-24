/**
 * Tokenizer 工具 —— 给上下文容量胶囊用。
 *
 * 现状：Anthropic 不公开 Claude 真实 tokenizer。`js-tiktoken` 的 cl100k_base
 * 跟 Claude 实际 BPE 在英文文本上误差 ~5%，对 CJK 大约 ~15%。我们用它做
 * **相对比例**估算（系统提示词 / 工具 / 消息 等占比），最终乘以 API 返回的
 * 真实 inputTokens —— 总量是准的，只是分类分摊有误差。
 *
 * 动态 import 把 ~250KB 的 bpe 数据从首屏 bundle 拆出去，只在第一次实际
 * 计算时加载。tokenizer 未就绪时 `estimateTokensSync` 走纯启发式（CJK ÷1.5、
 * 拉丁 ÷3.5），保证 UI 永远能渲染。
 */

import type { Tiktoken } from "js-tiktoken/lite";
import { createLogger } from "../services/logService";

const log = createLogger("tokenizer");

type TiktokenLoader = (encoding: "cl100k_base") => Tiktoken;

let encoderPromise: Promise<Tiktoken> | null = null;
let encoder: Tiktoken | null = null;

async function loadEncoder(): Promise<Tiktoken> {
	if (encoder) return encoder;
	if (!encoderPromise) {
		encoderPromise = (async () => {
			// 分两步动态 import：lite 引擎 + cl100k_base 数据，确保 bundler 都能 split
			const [{ Tiktoken: TiktokenCtor }, ranks] = await Promise.all([
				import("js-tiktoken/lite"),
				import("js-tiktoken/ranks/cl100k_base"),
			]);
			// js-tiktoken 的 lite 入口签名是 (rankData) => Tiktoken
			// 用 (encoder: TiktokenLoader) 兜底类型
			const _loader: TiktokenLoader | undefined = undefined;
			void _loader;
			const enc = new TiktokenCtor(ranks.default);
			encoder = enc;
			return enc;
		})().catch((err) => {
			// 加载失败：清空 promise 以便后续重试，但下一次也只能走 fallback
			encoderPromise = null;
			log.warn("failed to load js-tiktoken", { error: err });
			throw err;
		});
	}
	return encoderPromise;
}

/**
 * 启发式回退估算 —— tokenizer 还没加载完时用。
 * CJK 字符按 1.5 个字符/token、其他按 3.5 个字符/token，混合时按比例混算。
 *
 * 误差通常在 ±20% 以内，且我们只用比例不用绝对值，最终乘真实 inputTokens。
 */
export function estimateTokensHeuristic(text: string): number {
	if (!text) return 0;
	let cjk = 0;
	let other = 0;
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		// 粗略 CJK 范围：CJK 统一汉字 + 兼容扩展 + 假名 + 韩文
		if (
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0x3040 && code <= 0x30ff) ||
			(code >= 0xac00 && code <= 0xd7af) ||
			(code >= 0x3400 && code <= 0x4dbf)
		) {
			cjk++;
		} else {
			other++;
		}
	}
	return Math.ceil(cjk / 1.5 + other / 3.5);
}

/**
 * 同步 token 估算 —— tokenizer 已加载用真值，否则启发式回退。
 *
 * 注意：第一次调用时如果 tokenizer 没加载完，会**异步触发**加载并立刻
 * 返回 fallback。下一次调用就会用真 tokenizer。React 端配合
 * `useTokenizerReady()` 监听就绪后再重新计算即可。
 */
export function estimateTokensSync(text: string): number {
	if (!text) return 0;
	if (encoder) {
		try {
			return encoder.encode(text).length;
		} catch {
			return estimateTokensHeuristic(text);
		}
	}
	// 后台加载（首次调用触发），不 await
	void loadEncoder();
	return estimateTokensHeuristic(text);
}

/**
 * Promise 版本 —— 强制等 tokenizer 就绪。给测试 / 非渲染路径用。
 */
export async function estimateTokens(text: string): Promise<number> {
	if (!text) return 0;
	try {
		const enc = await loadEncoder();
		return enc.encode(text).length;
	} catch {
		return estimateTokensHeuristic(text);
	}
}

/**
 * React 侧用：等 tokenizer 就绪后重新计算。
 * 返回一个 Promise，加载好就 resolve。给 useEffect 做一次性 trigger。
 */
export function whenTokenizerReady(): Promise<void> {
	return loadEncoder().then(() => undefined);
}

/** 测试用：重置加载状态。 */
export function _resetTokenizerForTesting(): void {
	encoder = null;
	encoderPromise = null;
}
