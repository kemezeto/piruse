import { useEffect, useState, type RefObject } from "react";
import type { ViewItem } from "@protocol/view";

export function TurnNav({
	items,
	stageRef,
}: {
	items: ViewItem[];
	stageRef: RefObject<HTMLDivElement | null>;
}) {
	const rounds = userRounds(items);
	const roundKey = rounds.map((round) => round.id).join("\0");
	const [active, setActive] = useState(rounds[rounds.length - 1]?.id ?? "");

	useEffect(() => {
		const stage = stageRef.current;
		const ids = roundKey ? roundKey.split("\0") : [];
		if (!stage || ids.length < 2) return;
		const sync = (): void => setActive(activeRound(stage, ids));
		sync();
		stage.addEventListener("scroll", sync, { passive: true });
		return () => stage.removeEventListener("scroll", sync);
	}, [stageRef, roundKey]);

	if (rounds.length < 2) return null;

	const jump = (id: string): void => {
		const stage = stageRef.current;
		const target = stage?.querySelector(`[data-turn="${id}"]`);
		if (!stage || !(target instanceof HTMLElement)) return;
		const top = target.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop - 20;
		stage.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
		setActive(id);
	};

	return (
		<nav className="turn-nav" aria-label="对话轮次">
			<ul className="turn-nav-list">
				{rounds.map((round, index) => (
					<li key={round.id} className={round.id === active ? "active" : ""}>
						<button type="button" aria-label={`对话第 ${index + 1} 轮`} title={round.label} onClick={() => jump(round.id)}>
							<span className="turn-nav-label">{round.label}</span>
							<i className="turn-nav-tick" aria-hidden="true" />
						</button>
					</li>
				))}
			</ul>
		</nav>
	);
}

function userRounds(items: ViewItem[]): { id: string; label: string }[] {
	return items
		.filter((item): item is Extract<ViewItem, { kind: "user" }> => item.kind === "user")
		.map((item) => ({ id: item.id, label: roundLabel(item.text) }));
}

function roundLabel(text: string): string {
	const line = text.replace(/\s+/g, " ").trim();
	if (!line) return "对话";
	if (line.length <= 24) return line;
	return `${line.slice(0, 23)}…`;
}

function activeRound(stage: HTMLElement, ids: string[]): string {
	const probe = stage.getBoundingClientRect().top + 72;
	let current = ids[0] ?? "";
	for (const id of ids) {
		const el = stage.querySelector(`[data-turn="${id}"]`);
		if (!(el instanceof HTMLElement)) continue;
		if (el.getBoundingClientRect().top <= probe) current = id;
	}
	return current;
}
