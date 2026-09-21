import type { AnalyseSession } from "@protocol/analyse";
import type { ViewModelOption } from "@protocol/view";
import { dayHits, matchesModel, modelLabel, sessionsInRange } from "./filter";
import { addDays, eachDay, mondayOf, parseYmd, sundayOf, type ResolvedRange } from "./range";

export type ActivityMetric = "messages" | "sessions" | "tokens";
export type TimeGrain = "day" | "week" | "month";
export type HotSort = "messages" | "duration" | "tokens";

export interface DayStat {
	date: string;
	messages: number;
	sessions: number;
	tokens: number;
}

export interface HotSession {
	id: string;
	title: string;
	project: string;
	messages: number;
	durationMin: number;
	tokens: number;
	aborted: boolean;
	model: string;
}

export interface ToolStat {
	name: string;
	category: string;
	calls: number;
	sessions: number;
	share: number;
	color: string;
}

export interface ToolCategoryStat {
	name: string;
	calls: number;
	share: number;
	color: string;
}

export interface WeekPoint {
	date: string;
	calls: number;
}

export interface SkillStat {
	name: string;
	agents: { name: string; calls: number; share: number }[];
	projects: { name: string; calls: number }[];
	calls: number;
	sessions: number;
	lastUsed: string;
	color: string;
}

export interface SkillTrendPoint {
	date: string;
	values: Record<string, number>;
}

export interface OverviewStats {
	sessions: number;
	messages: number;
	projects: number;
	activeDays: number;
	perSession: number;
	median: number;
	p90: number;
	focus: number;
	focusProject: string;
	days: DayStat[];
	hourGrid: number[][];
	hot: HotSession[];
	aborted: number;
	tools: ToolStat[];
	toolCategories: ToolCategoryStat[];
	toolWeeks: WeekPoint[];
	toolCalls: number;
	skills: SkillStat[];
	skillTrend: SkillTrendPoint[];
	skillCalls: number;
}

const TOOL_META: Record<string, { category: string; color: string }> = {
	bash: { category: "Bash", color: "#ef4444" },
	shell_command: { category: "Bash", color: "#ef4444" },
	exec_command: { category: "Bash", color: "#ef4444" },
	write_stdin: { category: "Bash", color: "#ef4444" },
	read: { category: "Read", color: "#3b82f6" },
	read_file_v2: { category: "Read", color: "#3b82f6" },
	edit: { category: "Edit", color: "#f59e0b" },
	StrReplace: { category: "Edit", color: "#f59e0b" },
	apply_patch: { category: "Edit", color: "#f59e0b" },
	edit_file_v2: { category: "Edit", color: "#f59e0b" },
	write: { category: "Write", color: "#22c55e" },
	grep: { category: "Grep", color: "#a855f7" },
	glob: { category: "Glob", color: "#14b8a6" },
	subagent: { category: "Task", color: "#ec4899" },
	task: { category: "Task", color: "#ec4899" },
};

const CATEGORY_ORDER = ["Bash", "Edit", "Read", "Grep", "Write", "Glob", "Task", "Other"];
const CATEGORY_COLOR: Record<string, string> = {
	Bash: "#ef4444",
	Edit: "#f59e0b",
	Read: "#3b82f6",
	Grep: "#a855f7",
	Write: "#22c55e",
	Glob: "#14b8a6",
	Task: "#ec4899",
	Other: "#6b7280",
};

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const index = (sorted.length - 1) * q;
	const lo = Math.floor(index);
	const hi = Math.ceil(index);
	if (lo === hi) return sorted[lo] ?? 0;
	const weight = index - lo;
	return (sorted[lo] ?? 0) * (1 - weight) + (sorted[hi] ?? 0) * weight;
}

function metricOf(day: DayStat, metric: ActivityMetric): number {
	if (metric === "sessions") return day.sessions;
	if (metric === "tokens") return day.tokens;
	return day.messages;
}

function toolMeta(name: string): { category: string; color: string } {
	return TOOL_META[name] ?? { category: "Other", color: "#6b7280" };
}

export function contributionWeeks(days: DayStat[], metric: ActivityMetric) {
	if (days.length === 0) return { weeks: [] as { date: string; value: number }[][], months: [] as { index: number; label: string }[], max: 0 };
	const start = mondayOf(days[0]!.date);
	const last = days[days.length - 1]!.date;
	const end = sundayOf(last);
	const byDate = new Map(days.map((day) => [day.date, metricOf(day, metric)]));
	const weeks: { date: string; value: number }[][] = [];
	let cursor = start;
	while (cursor <= end) {
		weeks.push(
			Array.from({ length: 7 }, (_, index) => {
				const date = addDays(cursor, index);
				return { date, value: byDate.get(date) ?? 0 };
			}),
		);
		cursor = addDays(cursor, 7);
	}
	const months: { index: number; label: string }[] = [];
	weeks.forEach((week, index) => {
		const first = week.find((day) => day.date.endsWith("-01"));
		if (first) months.push({ index, label: `${parseYmd(first.date).getMonth() + 1}月` });
	});
	return { weeks, months, max: Math.max(1, ...weeks.flat().map((day) => day.value)) };
}

export function buildOverviewStats(
	range: ResolvedRange,
	sessions: AnalyseSession[],
	models: ViewModelOption[],
	modelFilter: string,
): OverviewStats {
	const filtered = sessionsInRange(sessions, range).filter((session) => matchesModel(session, modelFilter, models));
	const dates = eachDay(range.start, range.end);
	const byDate = new Map<string, DayStat>(
		dates.map((date) => [date, { date, messages: 0, sessions: 0, tokens: 0 }]),
	);
	const hourGrid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
	const projectMessages = new Map<string, number>();
	const sessionSizes: number[] = [];
	const toolCalls = new Map<string, { calls: number; sessions: number }>();
	const toolWeeks = new Map<string, number>();

	for (const session of filtered) {
		sessionSizes.push(session.messages);
		projectMessages.set(session.project, (projectMessages.get(session.project) ?? 0) + session.messages);
		const hits = dayHits(session, range.start, range.end);
		const counted = new Set<string>();
		for (const hit of hits) {
			const day = byDate.get(hit.date);
			if (!day) continue;
			day.messages += hit.messages;
			day.tokens += hit.tokens;
			if (!counted.has(hit.date)) {
				day.sessions += 1;
				counted.add(hit.date);
			}
			const dow = parseYmd(hit.date).getDay();
			hit.hours.forEach((value, hour) => {
				hourGrid[dow]![hour] += value;
			});
			const week = mondayOf(hit.date);
			toolWeeks.set(week, (toolWeeks.get(week) ?? 0) + hit.tools);
		}
		for (const tool of session.tools) {
			const current = toolCalls.get(tool.name) ?? { calls: 0, sessions: 0 };
			current.calls += tool.calls;
			if (tool.calls > 0) current.sessions += 1;
			toolCalls.set(tool.name, current);
		}
	}

	const days = dates.map((date) => byDate.get(date)!);
	const messages = days.reduce((sum, day) => sum + day.messages, 0);
	const sessionCount = filtered.length;
	sessionSizes.sort((a, b) => a - b);
	const rankedProjects = [...projectMessages.entries()].sort((left, right) => right[1] - left[1]);
	const top = rankedProjects[0];
	const tools = [...toolCalls.entries()]
		.map(([name, item]) => {
			const meta = toolMeta(name);
			return {
				name,
				category: meta.category,
				calls: item.calls,
				sessions: item.sessions,
				share: 0,
				color: meta.color,
			};
		})
		.sort((left, right) => right.calls - left.calls || left.name.localeCompare(right.name));
	const toolTotal = tools.reduce((sum, item) => sum + item.calls, 0);
	for (const item of tools) item.share = toolTotal === 0 ? 0 : item.calls / toolTotal;
	const byCategory = new Map<string, number>();
	for (const item of tools) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.calls);
	const toolCategories = CATEGORY_ORDER.filter((name) => byCategory.has(name)).map((name) => {
		const calls = byCategory.get(name) ?? 0;
		return { name, calls, share: toolTotal === 0 ? 0 : calls / toolTotal, color: CATEGORY_COLOR[name] ?? "#6b7280" };
	});
	const weekKeys: string[] = [];
	let cursor = mondayOf(range.start);
	while (cursor <= range.end) {
		weekKeys.push(cursor);
		cursor = addDays(cursor, 7);
	}

	return {
		sessions: sessionCount,
		messages,
		projects: projectMessages.size,
		activeDays: days.filter((day) => day.sessions > 0).length,
		perSession: sessionCount === 0 ? 0 : messages / sessionCount,
		median: quantile(sessionSizes, 0.5),
		p90: quantile(sessionSizes, 0.9),
		focus: messages === 0 || !top ? 0 : top[1] / messages,
		focusProject: top?.[0] ?? "—",
		days,
		hourGrid,
		hot: [...filtered]
			.sort((left, right) => right.messages - left.messages)
			.slice(0, 10)
			.map((session) => ({
				id: session.id,
				title: session.title,
				project: session.project,
				messages: session.messages,
				durationMin: Math.round(session.durationMin),
				tokens: session.usage.output,
				aborted: session.aborted,
				model: modelLabel(session, models),
			})),
		aborted: filtered.filter((session) => session.aborted).length,
		tools,
		toolCategories,
		toolWeeks: weekKeys.map((date) => ({ date, calls: toolWeeks.get(date) ?? 0 })),
		toolCalls: toolTotal,
		skills: [],
		skillTrend: dates.map((date) => ({ date, values: {} })),
		skillCalls: 0,
	};
}

export function activityLevel(value: number, max: number): number {
	if (value <= 0 || max <= 0) return 0;
	return Math.min(4, Math.ceil((value / max) * 4));
}

export function seriesFor(days: DayStat[], grain: TimeGrain, metric: ActivityMetric): { label: string; value: number; date: string }[] {
	if (grain === "day") {
		return days.map((day) => ({
			label: `${parseYmd(day.date).getMonth() + 1}/${parseYmd(day.date).getDate()}`,
			value: metricOf(day, metric),
			date: day.date,
		}));
	}
	const buckets = new Map<string, { label: string; value: number; date: string }>();
	for (const day of days) {
		const date = parseYmd(day.date);
		const key =
			grain === "week"
				? addDays(day.date, date.getDay() === 0 ? -6 : 1 - date.getDay())
				: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
		const current = buckets.get(key);
		const label = `${date.getMonth() + 1}月`;
		buckets.set(key, {
			label,
			value: (current?.value ?? 0) + metricOf(day, metric),
			date: current?.date ?? day.date,
		});
	}
	return [...buckets.values()];
}

export function sortedHot(hot: HotSession[], sort: HotSort): HotSession[] {
	const copy = [...hot];
	copy.sort((a, b) => {
		if (sort === "duration") return b.durationMin - a.durationMin;
		if (sort === "tokens") return b.tokens - a.tokens;
		return b.messages - a.messages;
	});
	return copy;
}
