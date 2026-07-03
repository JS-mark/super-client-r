/**
 * useCurrentModelInfoRef — a tiny mutable ref holding the "model info I
 * *tried* to send with" snapshot. Kept as a dedicated helper so:
 *
 *   1. Send pipeline (`useAgentSendPipeline`) writes to `.current` right
 *      before the runtime `createQuery` call.
 *   2. Error materialisation (`materializeStreamError`) reads `.current`
 *      to enrich the ErrorCard even when the stream never opens.
 *   3. The `AgentEventReducerContext` builder reads it to render the
 *      streaming assistant bubble with the real provider icon.
 *
 * The ref lives outside `useMessageModelResolution` because the latter is
 * a pure resolver — this one deliberately mutates during a send.
 */
import { useRef, type MutableRefObject } from "react";
import type { CurrentModelInfoSnapshot } from "./useAgentSendPipeline";

export type { CurrentModelInfoSnapshot } from "./useAgentSendPipeline";

export interface CurrentModelInfoRefHandle {
	ref: MutableRefObject<CurrentModelInfoSnapshot | null>;
	get(): CurrentModelInfoSnapshot | null;
	set(snapshot: CurrentModelInfoSnapshot | null): void;
	clear(): void;
}

export function createCurrentModelInfoRef(
	initial: CurrentModelInfoSnapshot | null = null,
): CurrentModelInfoRefHandle {
	const ref: MutableRefObject<CurrentModelInfoSnapshot | null> = {
		current: initial,
	};
	return {
		ref,
		get: () => ref.current,
		set: (snapshot) => {
			ref.current = snapshot;
		},
		clear: () => {
			ref.current = null;
		},
	};
}

export function useCurrentModelInfoRef(): CurrentModelInfoRefHandle {
	const ref = useRef<CurrentModelInfoSnapshot | null>(null);
	const handleRef = useRef<CurrentModelInfoRefHandle | null>(null);
	if (!handleRef.current) {
		handleRef.current = {
			ref,
			get: () => ref.current,
			set: (snapshot) => {
				ref.current = snapshot;
			},
			clear: () => {
				ref.current = null;
			},
		};
	}
	return handleRef.current;
}
