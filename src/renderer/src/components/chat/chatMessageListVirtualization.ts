const VIRTUAL_MESSAGE_TURN_THRESHOLD = 80;

export function shouldVirtualizeMessageList(turnCount: number): boolean {
	return turnCount > VIRTUAL_MESSAGE_TURN_THRESHOLD;
}
