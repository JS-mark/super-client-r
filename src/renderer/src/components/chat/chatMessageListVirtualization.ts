// Threshold below which the message list always renders with antd-x's
// `Bubble.List` (full DOM mount). Above it we switch to `react-window`
// virtualization so only the visible window is in the DOM.
//
// Previously 80 — that meant everyday conversations never hit virtualization
// and the whole list stayed mounted, which (combined with the heavy per-bubble
// markdown / code-block rendering) was a major source of jank once a session
// grew past a few dozen turns. With the composer input moved out of the React
// tree (see chatInputStore / 2026-06-28 perf pass) and highlight.js replacing
// CodeMirror for static code blocks, virtualization is cheap enough to enable
// much earlier.
//
// 20 turns is roughly the point where the DOM cost of keeping every bubble
// mounted starts to noticeably exceed the per-row measurement / positioning
// overhead of react-window on a typical laptop.
const VIRTUAL_MESSAGE_TURN_THRESHOLD = 20;

export function shouldVirtualizeMessageList(turnCount: number): boolean {
	return turnCount > VIRTUAL_MESSAGE_TURN_THRESHOLD;
}

/**
 * Smoothly scrolls the given element to its current bottom.
 *
 * We hand-roll the animation (rAF + easeOutCubic) instead of using
 * `el.scrollTo({ behavior: 'smooth' })` because:
 *   1. Native smooth scroll captures the target scrollTop ONCE at start. Any
 *      layout shift during the animation (markdown reflow, code blocks
 *      finishing highlight, images loading) makes it land short of the
 *      actual bottom.
 *   2. We can't cancel native smooth scroll programmatically.
 *
 * Our loop recalculates `el.scrollHeight - el.clientHeight` every frame so
 * the destination tracks any growth that happens mid-flight. After the
 * easing window closes we run two extra `requestAnimationFrame` snaps to
 * catch the final settling pixels (e.g. when react-window's
 * `useDynamicRowHeight` resolves the last row's measurement a frame late).
 *
 * Returns a cancel function — call it if the user starts another scroll
 * action so we don't fight their input.
 */
export function smoothScrollToBottom(
	el: HTMLElement | null,
	options: { durationMs?: number } = {},
): () => void {
	if (!el) return () => {};
	const duration = options.durationMs ?? 340;
	const startTop = el.scrollTop;
	const startTime = performance.now();
	let rafId: number | null = null;
	let cancelled = false;

	// easeOutCubic: starts fast, decelerates — feels like the bottom is
	// "pulling" you in rather than dragging.
	const ease = (t: number) => 1 - (1 - t) ** 3;

	const step = (now: number) => {
		if (cancelled || !el.isConnected) return;
		const elapsed = now - startTime;
		const t = Math.min(1, elapsed / duration);
		// Re-read every frame so growing content during the animation still
		// counts. `scrollHeight - clientHeight` is the true bottom.
		const targetTop = Math.max(0, el.scrollHeight - el.clientHeight);
		el.scrollTop = startTop + (targetTop - startTop) * ease(t);
		if (t < 1) {
			rafId = requestAnimationFrame(step);
			return;
		}
		// Final snap retries — handle late layout (e.g. react-window row
		// height resolving after the easing window ends).
		const snap = () => {
			if (cancelled || !el.isConnected) return;
			el.scrollTop = el.scrollHeight - el.clientHeight;
		};
		rafId = requestAnimationFrame(() => {
			snap();
			rafId = requestAnimationFrame(snap);
		});
	};

	rafId = requestAnimationFrame(step);

	return () => {
		cancelled = true;
		if (rafId !== null) cancelAnimationFrame(rafId);
	};
}
