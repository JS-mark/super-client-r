import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SlashItem } from "../components/chat/SlashCommandPanel";
import { useChatInputStore } from "../stores/chatInputStore";

interface UseSlashCommandsParams {
	setSelectedSkillId: (id: string | null) => void;
	setSelectedCommandName: (name: string | null) => void;
	// NOTE: `setInput` used to be threaded from the host component; the composer
	// input value now lives in `chatInputStore` so keystrokes no longer re-render
	// Chat.tsx. See the 2026-06-28 perf comment in `useChat.ts`.
}

export function useSlashCommands({
	setSelectedSkillId,
	setSelectedCommandName,
}: UseSlashCommandsParams) {
	const [slashPanelOpen, setSlashPanelOpen] = useState(false);
	const [slashQuery, setSlashQuery] = useState("");
	const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
	const [slashHighlight, setSlashHighlight] = useState(0);

	// Load skills and commands once for slash panel
	useEffect(() => {
		import("../services/skill/skillService").then(({ skillClient }) => {
			skillClient
				.listSkills()
				.then((skills) => {
					const items: SlashItem[] = [];
					for (const skill of skills) {
						items.push({ type: "skill", skill });
						if (skill.commands) {
							for (const cmd of skill.commands) {
								items.push({
									type: "command",
									command: cmd,
									skillName: skill.name,
									skillIcon: skill.icon,
								});
							}
						}
					}
					setSlashItems(items);
				})
				.catch(() => setSlashItems([]));
		});
	}, []);

	// Filtered items for slash command panel
	const slashFilteredItems = useMemo(() => {
		if (!slashPanelOpen) return [];
		if (!slashQuery) return slashItems;
		const q = slashQuery.toLowerCase();
		return slashItems.filter((item) => {
			if (item.type === "skill") {
				return (
					item.skill.name.toLowerCase().includes(q) ||
					item.skill.description.toLowerCase().includes(q) ||
					item.skill.id.toLowerCase().includes(q)
				);
			}
			return (
				item.command.name.toLowerCase().includes(q) ||
				item.command.description.toLowerCase().includes(q) ||
				item.skillName.toLowerCase().includes(q)
			);
		});
	}, [slashPanelOpen, slashItems, slashQuery]);

	// Reset highlight when query changes
	useEffect(() => {
		setSlashHighlight(0);
	}, [slashQuery]);

	// Slash command item selection — sets skill independently (no mode change)
	const handleSlashSelect = useCallback(
		(item: SlashItem) => {
			if (item.type === "command") {
				setSelectedSkillId(item.command.skillId);
				setSelectedCommandName(item.command.name);
			} else {
				setSelectedSkillId(item.skill.id);
				setSelectedCommandName(null);
			}
			// Clear the shared composer input — selecting a slash command picks a
			// skill/command and should reset whatever draft the user was typing.
			useChatInputStore.getState().clear();
			setSlashPanelOpen(false);
			setSlashQuery("");
		},
		[setSelectedSkillId, setSelectedCommandName],
	);

	// Use refs so the native capture listener always sees fresh values
	const slashStateRef = useRef({
		open: false,
		items: [] as SlashItem[],
		highlight: 0,
	});
	slashStateRef.current = {
		open: slashPanelOpen,
		items: slashFilteredItems,
		highlight: slashHighlight,
	};

	// Register capture-phase keydown on a given element
	// (fires before Sender's internal handlers)
	const registerKeydownHandler = useCallback(
		(el: HTMLElement | null) => {
			if (!el) return () => {};

			const handleKeyDown = (e: KeyboardEvent) => {
				const { open, items, highlight } = slashStateRef.current;
				if (!open) return;

				if (e.key === "ArrowDown") {
					e.preventDefault();
					e.stopImmediatePropagation();
					setSlashHighlight(highlight < items.length - 1 ? highlight + 1 : 0);
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					e.stopImmediatePropagation();
					setSlashHighlight(highlight > 0 ? highlight - 1 : items.length - 1);
				} else if (e.key === "Enter") {
					e.preventDefault();
					e.stopImmediatePropagation();
					if (items.length > 0) {
						handleSlashSelect(items[highlight]);
					}
				} else if (e.key === "Escape") {
					e.preventDefault();
					e.stopImmediatePropagation();
					setSlashPanelOpen(false);
					setSlashQuery("");
				}
			};

			el.addEventListener("keydown", handleKeyDown, true);
			return () => el.removeEventListener("keydown", handleKeyDown, true);
		},
		[handleSlashSelect],
	);

	// Handle input change: detect slash prefix
	const handleSlashInputChange = useCallback(
		(val: string) => {
			if (val.startsWith("/")) {
				setSlashPanelOpen(true);
				setSlashQuery(val.slice(1));
			} else if (slashPanelOpen) {
				setSlashPanelOpen(false);
				setSlashQuery("");
			}
		},
		[slashPanelOpen],
	);

	return {
		slashPanelOpen,
		setSlashPanelOpen,
		slashQuery,
		setSlashQuery,
		slashFilteredItems,
		slashHighlight,
		setSlashHighlight,
		handleSlashSelect,
		slashStateRef,
		registerKeydownHandler,
		handleSlashInputChange,
	};
}
