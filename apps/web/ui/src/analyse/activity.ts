import type { AnalyseSession } from "@protocol/analyse";
import type { ViewModelOption } from "@protocol/view";
import { matchesAgent, matchesModel, matchesProject, modelLabel, sessionsInRange } from "./filter";
import { clockShanghai, eachDay, shanghaiMs, ymdShanghai, type ResolvedRange } from "./range";

export type OverlayMetric = "none" | "token" | "cost";
export type ActivitySort = "minutes" | "cost" | "title" | "project" | "agent" | "window";

export interface ActivityDay {
	date: string;
	interactive: number;
	automation: number;
	tokens: number;
	cost: number;
}

export interface ActivitySessionRow {
	id: string;
	title: string;
	model: string;
	project: string;
	agent: string;
	minutes: number;
	cost: number;
	window: string;
	timed: boolean;
	kind: "interactive" | "automation";
}

export interface ActivityStats {
	peakConcurrency: number;
	peakAt: string;
	activeMinutes: number;
	idleMinutes: number;
	agentMinutes: number;
	untimed: number;
	sessions: number;
	projects: number;
	models: number;
	totalCost: number;
	inProgress: boolean;
	days: ActivityDay[];
	rows: ActivitySessionRow[];
}

function unionMinutes(intervals: { start: number; end: number }[]): number {
	const sorted = [...intervals].filter((item) => item.end > item.start).sort((a, b) => a.start - b.start);
	if (sorted.length === 0) return 0;
	let total = 0;
	let start = sorted[0]!.start;
	let end = sorted[0]!.end;
	for (const item of sorted.slice(1)) {
		if (item.start <= end) {
			end = Math.max(end, item.end);
			continue;
		}
		total += end - start;
		start = item.start;
		end = item.end;
	}
	return (total + (end - start)) / 60_000;
}

function peakOf(intervals: { start: number; end: number }[]): { peak: number; at: number } {
	const events: { at: number; delta: number }[] = [];
	for (const item of intervals) {
		events.push({ at: item.start, delta: 1 });
		events.push({ at: item.end, delta: -1 });
	}
	events.sort((a, b) => a.at - b.at || a.delta - b.delta);
	let current = 0;
	let peak = 0;
	let at = intervals[0]?.start ?? 0;
	for (const event of events) {
		current += event.delta;
		if (current > peak) {
			peak = current;
			at = event.at;
		}
	}
	return { peak, at };
}

function peakSplit(
	intervals: { start: number; end: number; kind: "interactive" | "automation" }[],
	dayStart: number,
	dayEnd: number,
): { interactive: number; automation: number } {
	const events: { at: number; kind: "interactive" | "automation"; delta: number }[] = [];
	for (const item of intervals) {
		const start = Math.max(item.start, dayStart);
		const end = Math.min(item.end, dayEnd);
		if (end <= start) continue;
		events.push({ at: start, kind: item.kind, delta: 1 });
		events.push({ at: end, kind: item.kind, delta: -1 });
	}
	events.sort((a, b) => a.at - b.at || a.delta - b.delta);
	let interactive = 0;
	let automation = 0;
	let bestI = 0;
	let bestA = 0;
	let best = 0;
	for (const event of events) {
		if (event.kind === "interactive") interactive += event.delta;
		else automation += event.delta;
		const total = interactive + automation;
		if (total > best) {
			best = total;
			bestI = interactive;
			bestA = automation;
		}
	}
	return { interactive: bestI, automation: bestA };
}

export function formatDuration(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safe / 60);
	const mins = safe % 60;
	return `${hours}h ${mins}m`;
}

function intervalOf(session: AnalyseSession, rangeStart: number, rangeEnd: number): { start: number; end: number } | undefined {
	const start = session.startedAt;
	const end = session.endedAt;
	if (start === undefined || end === undefined) return undefined;
	const clippedStart = Math.max(start, rangeStart);
	const clippedEnd = Math.min(end, rangeEnd);
	if (clippedEnd <= clippedStart) return undefined;
	return { start: clippedStart, end: clippedEnd };
}

export function buildActivityStats(
	range: ResolvedRange,
	sessions: AnalyseSession[],
	models: ViewModelOption[],
	filters: { project: string; agent: string; session: string },
	now = Date.now(),
	today = ymdShanghai(now),
): ActivityStats {
	const filtered = sessionsInRange(sessions, range).filter(
		(session) =>
			matchesProject(session, filters.project) &&
			matchesAgent(filters.agent) &&
			matchesModel(session, "全部", models) &&
			(filters.session === "全部会话" || session.title === filters.session),
	);
	const liveEnd = Math.min(now, shanghaiMs(range.end, 23, 59));
	const rangeStartMs = shanghaiMs(range.start, 0, 0);
	const elapsedMinutes = Math.max(0, (liveEnd - rangeStartMs) / 60_000);
	const dates = eachDay(range.start, range.end);
	const placed = filtered.map((session) => {
		const timed = session.startedAt !== undefined && session.endedAt !== undefined && session.endedAt > session.startedAt;
		const start = session.startedAt ?? 0;
		const end = session.endedAt ?? start;
		const row: ActivitySessionRow = {
			id: session.id,
			title: session.title,
			model: modelLabel(session, models),
			project: session.project,
			agent: "coding",
			minutes: session.durationMin,
			cost: session.usage.cost,
			window: timed ? `${clockShanghai(start)}–${clockShanghai(end)}` : "—",
			timed,
			kind: "interactive",
		};
		return { row, start, end, session };
	});
	const timed = placed.filter((item) => item.row.timed);
	const intervals = timed
		.map((item) => intervalOf(item.session, rangeStartMs, liveEnd))
		.filter((item): item is { start: number; end: number } => item !== undefined)
		.map((item) => ({ ...item, kind: "interactive" as const }));
	const peak = peakOf(intervals);
	const days: ActivityDay[] = dates.map((date) => {
		const dayStart = shanghaiMs(date, 0, 0);
		const dayEnd = shanghaiMs(date, 23, 59);
		const split = peakSplit(intervals, dayStart, dayEnd);
		const dayRows = timed.filter((item) => ymdShanghai(item.start) === date || (item.start < dayEnd && item.end > dayStart));
		return {
			date,
			interactive: split.interactive,
			automation: split.automation,
			tokens: dayRows.reduce((sum, item) => sum + item.session.usage.output, 0),
			cost: dayRows.reduce((sum, item) => sum + item.session.usage.cost, 0),
		};
	});
	const rows = placed.map((item) => item.row);
	const projectSet = new Set(rows.map((item) => item.project));
	const modelSet = new Set(rows.map((item) => item.model).filter((name) => name !== "—"));
	return {
		peakConcurrency: peak.peak,
		peakAt: peak.at ? clockShanghai(peak.at) : "—",
		activeMinutes: unionMinutes(intervals),
		idleMinutes: Math.max(0, elapsedMinutes - unionMinutes(intervals)),
		agentMinutes: rows.reduce((sum, item) => sum + item.minutes, 0),
		untimed: rows.filter((item) => !item.timed).length,
		sessions: rows.length,
		projects: projectSet.size,
		models: modelSet.size,
		totalCost: rows.reduce((sum, item) => sum + item.cost, 0),
		inProgress: today >= range.start && today <= range.end,
		days,
		rows,
	};
}

export function sortedActivity(rows: ActivitySessionRow[], sort: ActivitySort, desc: boolean): ActivitySessionRow[] {
	const copy = [...rows];
	const direction = desc ? -1 : 1;
	copy.sort((a, b) => {
		if (sort === "minutes") return (a.minutes - b.minutes) * direction;
		if (sort === "cost") return (a.cost - b.cost) * direction;
		if (sort === "title") return a.title.localeCompare(b.title, "zh") * direction;
		if (sort === "project") return a.project.localeCompare(b.project, "zh") * direction;
		if (sort === "agent") return a.agent.localeCompare(b.agent, "zh") * direction;
		return a.window.localeCompare(b.window) * direction;
	});
	return copy;
}

export function activityFilterOptions(sessions: AnalyseSession[]): {
	projects: string[];
	agents: string[];
	sessions: string[];
} {
	const projects = [...new Set(sessions.map((session) => session.project))].sort((left, right) => left.localeCompare(right, "zh"));
	const titles = [...new Set(sessions.map((session) => session.title))].sort((left, right) => left.localeCompare(right, "zh"));
	return {
		projects: ["所有项目", ...projects],
		agents: ["全部代理", "coding"],
		sessions: ["全部会话", ...titles.slice(0, 40)],
	};
}
