import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
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
}

const FALLBACK_TITLES = [
	{ title: "编写精简agent.md", project: "host_com_web" },
	{ title: "分析当前项目", project: "host_com_web" },
	{ title: "Pi agent desktop development", project: "host_com_web" },
	{ title: "分析项目整体架构", project: "host_com_web" },
	{ title: "WSL Android Studio setup", project: "new_work" },
	{ title: "重构 cloud-downloads 页面", project: "pgri_analyse_system" },
	{ title: "删除 “工艺配方”分组及其下方的菜单栏", project: "host_com_web" },
	{ title: "这个软件是用来干什么的?", project: "Q_portable" },
	{ title: "Temperature gradient visualization", project: "new_work" },
	{ title: "Internal mobile app solution", project: "new_work" },
];

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

export function contributionWeeks(days: DayStat[], metric: ActivityMetric) {
	if (days.length === 0) return { weeks: [] as { date: string; value: number }[][], months: [] as { index: number; label: string }[], max: 0 };
	const start = mondayOf(days[0]!.date);
	const last = days[days.length - 1]!.date;
	const end = sundayOf(last);
	const byDate = new Map(days.map((day) => [day.date, metricOf(day, metric)]));
	const weeks: { date: string; value: number }[][] = [];
	let cursor = start;
	while (cursor <= end) {
		weeks.push(Array.from({ length: 7 }, (_, index) => {
			const date = addDays(cursor, index);
			return { date, value: byDate.get(date) ?? 0 };
		}));
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
	projects: ViewProjectOption[],
	models: ViewModelOption[],
	modelFilter: string,
): OverviewStats {
	const random = rng(hash(`${range.start}:${range.end}:${modelFilter}`));
	const modelFactor = modelFilter === "全部" ? 1 : 0.38 + (hash(modelFilter) % 40) / 100;
	const dates = eachDay(range.start, range.end);
	const span = Math.max(1, dates.length);
	const days = dates.map((date, index) => {
		const weekday = parseYmd(date).getDay();
		const weekend = weekday === 0 || weekday === 6 ? 0.22 : 1;
		const recency = 0.08 + Math.pow((index + 1) / span, 2.15) * 0.92;
		const burst = random() > 0.82 ? 1.8 : 1;
		const noise = 0.55 + random();
		const sessions = Math.round(random() * 4.2 * weekend * recency * burst * noise * modelFactor);
		const messages = sessions === 0 ? 0 : Math.round(sessions * (48 + random() * 260) * (0.8 + recency));
		const tokens = messages === 0 ? 0 : Math.round(messages * (80 + random() * 220));
		return { date, messages, sessions, tokens };
	});

	const sessionSizes: number[] = [];
	for (const day of days) {
		for (let index = 0; index < day.sessions; index += 1) {
			sessionSizes.push(Math.max(1, Math.round(8 + random() * 40 + (random() > 0.9 ? 180 : 0))));
		}
	}
	sessionSizes.sort((a, b) => a - b);

	const projectNames = projects.length > 0 ? projects.map((project) => project.name) : [...new Set(FALLBACK_TITLES.map((item) => item.project))];
	const weights = projectNames.map((_, index) => (index === 0 ? 4.6 : 1 + (hash(projectNames[index] ?? "") % 8) / 10));
	const weightSum = weights.reduce((sum, value) => sum + value, 0);
	const projectMessages = projectNames.map((name, index) => ({
		name,
		value: Math.round((days.reduce((sum, day) => sum + day.messages, 0) * (weights[index] ?? 1)) / weightSum),
	}));
	projectMessages.sort((a, b) => b.value - a.value);

	const hourGrid = Array.from({ length: 7 }, (_, dow) =>
		Array.from({ length: 24 }, (_, hour) => {
			const work = hour >= 9 && hour <= 18 ? 1 : hour >= 7 && hour <= 21 ? 0.45 : 0.08;
			const weekday = dow === 0 || dow === 6 ? 0.2 : 1;
			const value = work * weekday * (0.15 + random());
			if (value < 0.12) return 0;
			return Math.round(value * (18 + random() * 70) * modelFactor);
		}),
	);

	const catalog = models.map((model) => model.name);
	const modelName = modelFilter === "全部" ? (catalog[0] ?? "default") : modelFilter;
	const realSessions = projects.flatMap((project) =>
		project.sessions.map((session) => ({ title: session.title, project: project.name, id: session.id })),
	);
	const pool = realSessions.length > 0 ? realSessions : FALLBACK_TITLES.map((item, index) => ({ ...item, id: `demo-${index}` }));
	const hot = [...pool, ...FALLBACK_TITLES.map((item, index) => ({ ...item, id: `fb-${index}` }))]
		.slice(0, 10)
		.map((item, index) => ({
			id: item.id,
			title: item.title,
			project: item.project,
			messages: Math.round((1200 - index * 58) * modelFactor * (0.92 + random() * 0.12)),
			durationMin: Math.round(40 + (9 - index) * 18 + random() * 20),
			tokens: Math.round((98000 - index * 6200) * modelFactor),
			aborted: index === 6,
			model: catalog[index % Math.max(1, catalog.length)] ?? modelName,
		}))
		.filter((item) => modelFilter === "全部" || item.model === modelFilter || catalog.length === 0);

	const messages = days.reduce((sum, day) => sum + day.messages, 0);
	const sessions = days.reduce((sum, day) => sum + day.sessions, 0);
	const activeDays = days.filter((day) => day.sessions > 0).length;
	const top = projectMessages[0];

	return {
		sessions,
		messages,
		projects: projectNames.length,
		activeDays,
		perSession: sessions === 0 ? 0 : messages / sessions,
		median: quantile(sessionSizes, 0.5),
		p90: quantile(sessionSizes, 0.9),
		focus: messages === 0 || !top ? 0 : top.value / messages,
		focusProject: top?.name ?? "—",
		days,
		hourGrid,
		hot,
		aborted: hot.filter((item) => item.aborted).length,
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
		const label =
			grain === "week" ? `${date.getMonth() + 1}月` : `${date.getMonth() + 1}月`;
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
