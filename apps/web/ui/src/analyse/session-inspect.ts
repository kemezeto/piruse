import type { ViewItem } from "@protocol/view";

export type InspectTurn =
	| { kind: "user"; id: string; text: string; at?: number }
	| { kind: "assistant"; id: string; text: string; at?: number; tokens?: number }
	| { kind: "note"; id: string; text: string; at?: number }
	| { kind: "tools"; id: string; items: Extract<ViewItem, { kind: "tool" }>[]; at?: number };

export interface SessionMetrics {
	startedAt?: number;
	endedAt?: number;
	durationMs: number;
	tokens: number;
	toolCount: number;
	toolMs: number;
	lastTool?: { name: string; durationMs: number };
	subagents: number;
}

export function groupTurns(items: ViewItem[]): InspectTurn[] {
	const turns: InspectTurn[] = [];
	let tools: Extract<ViewItem, { kind: "tool" }>[] = [];

	const flush = (): void => {
		if (tools.length === 0) return;
		turns.push({ kind: "tools", id: tools[0]!.id, items: tools, at: tools[0]?.at });
		tools = [];
	};

	for (const item of items) {
		if (item.kind === "tool") {
			tools.push(item);
			continue;
		}
		flush();
		if (item.kind === "user") turns.push({ kind: "user", id: item.id, text: item.text, at: item.at });
		else if (item.kind === "assistant") {
			turns.push({ kind: "assistant", id: item.id, text: item.text, at: item.at, tokens: item.tokens });
		} else if (item.kind === "note") turns.push({ kind: "note", id: item.id, text: item.text, at: item.at });
	}
	flush();
	return turns;
}

export function sessionMetrics(items: ViewItem[]): SessionMetrics {
	const times = items.map((item) => item.at).filter((value): value is number => typeof value === "number");
	const tools = items.filter((item): item is Extract<ViewItem, { kind: "tool" }> => item.kind === "tool");
	const startedAt = times.length > 0 ? Math.min(...times) : undefined;
	const endedAt = times.length > 0 ? Math.max(...times) : undefined;
	const last = tools[tools.length - 1];
	return {
		startedAt,
		endedAt,
		durationMs: startedAt && endedAt ? Math.max(0, endedAt - startedAt) : 0,
		tokens: items.reduce((sum, item) => sum + (item.kind === "assistant" ? (item.tokens ?? 0) : 0), 0),
		toolCount: tools.length,
		toolMs: tools.reduce((sum, item) => sum + (item.durationMs ?? 0), 0),
		lastTool: last ? { name: last.name, durationMs: last.durationMs ?? 0 } : undefined,
		subagents: tools.filter((item) => item.name === "subagent" || item.name === "task").length,
	};
}

export function formatClock(ms?: number): string {
	if (ms == null) return "—";
	const date = new Date(ms);
	const hh = String(date.getHours()).padStart(2, "0");
	const mm = String(date.getMinutes()).padStart(2, "0");
	return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}

export function formatDur(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

export function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(Math.round(value));
}

export function matchesQuery(item: ViewItem, query: string): boolean {
	if (!query) return true;
	const needle = query.toLowerCase();
	if (item.kind === "tool") {
		return `${item.name} ${item.args} ${item.result ?? ""}`.toLowerCase().includes(needle);
	}
	if (item.kind === "assistant") {
		return `${item.text} ${item.thinking ?? ""}`.toLowerCase().includes(needle);
	}
	return item.text.toLowerCase().includes(needle);
}

export type LaneKind = "other" | "tool";

export interface TimelineEvent {
	id: string;
	kind: LaneKind;
	start: number;
	end: number;
	label: string;
}

export function timelineEvents(items: ViewItem[]): TimelineEvent[] {
	const events: TimelineEvent[] = [];
	for (let index = 0; index < items.length; index++) {
		const item = items[index]!;
		const next = items[index + 1];
		if (item.kind === "tool") {
			const end = item.at ?? 0;
			const duration = Math.max(item.durationMs ?? 0, 1);
			const start = end ? Math.max(0, end - duration) : 0;
			events.push({ id: item.id, kind: "tool", start, end: end || start + duration, label: item.name });
			continue;
		}
		const start = item.at ?? 0;
		const end = next?.at && next.at > start ? next.at : start + 1;
		events.push({ id: item.id, kind: "other", start, end, label: item.kind });
	}
	return events;
}

export interface RoundStat {
	id: string;
	otherMs: number;
	toolMs: number;
	tools: number;
}

export function roundStats(turns: InspectTurn[]): RoundStat[] {
	const rounds: RoundStat[] = [];
	let current: RoundStat | null = null;
	const flush = (): void => {
		if (current) rounds.push(current);
		current = null;
	};
	for (const turn of turns) {
		if (turn.kind === "user") {
			flush();
			current = { id: turn.id, otherMs: 0, toolMs: 0, tools: 0 };
			continue;
		}
		if (!current) current = { id: turn.id, otherMs: 0, toolMs: 0, tools: 0 };
		if (turn.kind === "tools") {
			const ms = turn.items.reduce((sum, item) => sum + (item.durationMs ?? 0), 0);
			current.toolMs += ms;
			current.tools += turn.items.length;
			continue;
		}
		current.otherMs += 1;
	}
	flush();
	return rounds;
}

export function shortArgs(args: string): string {
	const text = args.replace(/\s+/g, " ").trim();
	if (text.length <= 88) return text;
	return `${text.slice(0, 87)}…`;
}
