import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { eachDay, type ResolvedRange } from "./range";

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

const FALLBACK_TITLES = [
	{ title: "WSL Android Studio setup", project: "new_work" },
	{ title: "Pi agent desktop development", project: "new_work" },
	{ title: "Uniapp menu display issue", project: "new_work" },
	{ title: "Mobile temperature time calculation", project: "new_work" },
	{ title: "Analyse Agent implementation", project: "piruse" },
	{ title: "Nitrogen layer depth interface", project: "new_work" },
	{ title: "Internal mobile app solution", project: "new_work" },
	{ title: "Mobile工艺路线页面设计", project: "new_work" },
	{ title: "Storage analyzer tool", project: "new_work" },
	{ title: "Diagnose 48080 bind failure", project: "ITBY20260307" },
	{ title: "Process on port 48080", project: "ITBY20260307" },
	{ title: "Context initialization file", project: "new_work" },
	{ title: "编写精简 agent.md", project: "piruse" },
	{ title: "分析当前项目结构", project: "piruse" },
	{ title: "Temperature gradient visualization", project: "new_work" },
];

const FALLBACK_AGENTS = ["cursor-ide", "coding", "analyse"];
const MINUTE_LADDER = [168, 128, 98, 84, 82, 54, 44, 30, 19, 15, 13, 13, 12, 11, 10, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3, 3];

function rng(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
}

function hash(text: string): number {
	let value = 2166136261;
	for (let index = 0; index < text.length; index += 1) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return value >>> 0;
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

function shanghaiMs(ymd: string, hour: number, minute: number): number {
	return new Date(`${ymd}T${pad(hour)}:${pad(minute)}:00+08:00`).getTime();
}

function clockOf(ms: number): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Shanghai",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(ms));
}

function ymdOf(ms: number): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(ms));
}

function uniqueNames(preferred: string[], fallback: string[]): string[] {
	const names: string[] = [];
	for (const name of [...preferred, ...fallback]) {
		if (!name || names.includes(name)) continue;
		names.push(name);
	}
	return names.length > 0 ? names : fallback.slice();
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

function peakOf(intervals: { start: number; end: number; kind: "interactive" | "automation" }[]): {
	peak: number;
	at: number;
} {
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

export function buildActivityStats(
	range: ResolvedRange,
	projects: ViewProjectOption[],
	models: ViewModelOption[],
	filters: { project: string; agent: string; session: string },
	now = Date.now(),
	today = ymdOf(now),
): ActivityStats {
	const random = rng(
		hash(`${range.start}:${range.end}:${filters.project}:${filters.agent}:${filters.session}`),
	);
	const dates = eachDay(range.start, range.end);
	const liveEnd = Math.min(now, shanghaiMs(range.end, 23, 59));
	const rangeStartMs = shanghaiMs(range.start, 0, 0);
	const elapsedMinutes = Math.max(0, (liveEnd - rangeStartMs) / 60_000);
	const activeDates = dates.filter((date) => date <= today);
	const projectNames = uniqueNames(
		projects.map((item) => item.name),
		FALLBACK_TITLES.map((item) => item.project),
	);
	const agentNames = uniqueNames([], FALLBACK_AGENTS);
	const modelNames = uniqueNames(
		models.map((item) => item.name),
		["—"],
	);
	const realSessions = projects.flatMap((project) =>
		project.sessions.map((session) => ({ title: session.title, project: project.name, id: session.id })),
	);
	const pool = [
		...realSessions,
		...FALLBACK_TITLES.map((item, index) => ({ ...item, id: `demo-${index}` })),
	];
	const count = Math.min(31, Math.max(12, pool.length, Math.round(activeDates.length * 2.4)));
	const untimedCount = 5;

	const placed: {
		row: ActivitySessionRow;
		start: number;
		end: number;
	}[] = [];

	const busyDays = activeDates.slice(0, Math.max(3, Math.min(8, activeDates.length)));
	for (let index = 0; index < count; index += 1) {
		const source = pool[index % pool.length]!;
		const timed = index < count - untimedCount;
		const minutes = timed ? (MINUTE_LADDER[index] ?? Math.max(2, Math.round(18 * (1 - index / count) + random() * 6))) : 0;
		const day = busyDays[index % busyDays.length] ?? range.start;
		const startHour = 9 + (index % 3) * 2 + Math.floor(random() * 2);
		const startMinute = index % 2 === 0 ? 30 : 10;
		const start = shanghaiMs(day, startHour, startMinute);
		const end = timed ? start + minutes * 60_000 : start;
		const kind: "interactive" | "automation" = random() > 0.82 ? "automation" : "interactive";
		const agent = kind === "automation" ? "copilot" : (agentNames[index % agentNames.length] ?? "cursor-ide");
		const project = projectNames[index % projectNames.length] ?? source.project;
		const model = modelNames.length === 0 || random() > 0.72 ? "—" : (modelNames[index % modelNames.length] ?? "—");
		const cost = timed && minutes > 80 ? Number((minutes * 0.00035 * (0.4 + random())).toFixed(2)) : timed && minutes > 40 ? Number((random() * 0.04).toFixed(2)) : 0;
		const row: ActivitySessionRow = {
			id: `${source.id}-${index}`,
			title: source.title,
			model,
			project,
			agent,
			minutes,
			cost,
			window: timed ? `${clockOf(start)}–${clockOf(end)}` : "—",
			timed,
			kind,
		};
		placed.push({ row, start, end });
	}

	let rows = placed.map((item) => item.row);
	if (filters.project !== "所有项目") rows = rows.filter((item) => item.project === filters.project);
	if (filters.agent !== "全部代理") rows = rows.filter((item) => item.agent === filters.agent);
	if (filters.session !== "全部会话") rows = rows.filter((item) => item.title === filters.session);
	const selected = new Set(rows.map((item) => item.id));
	const visible = placed.filter((item) => selected.has(item.row.id));
	const timed = visible.filter((item) => item.row.timed);

	const intervals = timed.map((item) => ({ start: item.start, end: item.end, kind: item.row.kind }));
	const peak = peakOf(intervals);
	const activeMinutes = unionMinutes(timed);
	const idleMinutes = Math.max(0, elapsedMinutes - activeMinutes);
	const days: ActivityDay[] = dates.map((date) => {
		const dayStart = shanghaiMs(date, 0, 0);
		const dayEnd = shanghaiMs(date, 23, 59);
		const split = peakSplit(timed.map((item) => ({ start: item.start, end: item.end, kind: item.row.kind })), dayStart, dayEnd);
		const interactive = split.interactive;
		const automation = split.automation;
		const dayRows = timed.filter((item) => ymdOf(item.start) === date || (item.start < dayEnd && item.end > dayStart));
		const tokens = dayRows.reduce((sum, item) => sum + item.row.minutes * (92 + hash(item.row.id) % 40), 0);
		const cost = dayRows.reduce((sum, item) => sum + item.row.cost, 0);
		return { date, interactive, automation, tokens, cost };
	});

	const projectSet = new Set(rows.map((item) => item.project));
	const modelSet = new Set(rows.map((item) => item.model).filter((name) => name !== "—"));
	if (modelSet.size === 0) modelNames.filter((name) => name !== "—").forEach((name) => modelSet.add(name));
	const inProgress = today >= range.start && today <= range.end;

	return {
		peakConcurrency: peak.peak,
		peakAt: peak.at ? clockOf(peak.at) : "—",
		activeMinutes,
		idleMinutes,
		agentMinutes: timed.reduce((sum, item) => sum + item.row.minutes, 0),
		untimed: rows.filter((item) => !item.timed).length,
		sessions: rows.length,
		projects: projectSet.size,
		models: Math.max(1, modelSet.size),
		totalCost: rows.reduce((sum, item) => sum + item.cost, 0),
		inProgress,
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

export function activityFilterOptions(projects: ViewProjectOption[]): {
	projects: string[];
	agents: string[];
	sessions: string[];
} {
	const names = uniqueNames(
		projects.map((item) => item.name),
		FALLBACK_TITLES.map((item) => item.project),
	);
	const titles = uniqueNames(
		projects.flatMap((item) => item.sessions.map((session) => session.title)),
		FALLBACK_TITLES.map((item) => item.title),
	);
	return {
		projects: ["所有项目", ...names],
		agents: ["全部代理", ...FALLBACK_AGENTS, "copilot"],
		sessions: ["全部会话", ...titles.slice(0, 24)],
	};
}
