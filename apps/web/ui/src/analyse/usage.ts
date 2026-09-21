import type { AnalyseSession } from "@protocol/analyse";
import type { ViewModelOption } from "@protocol/view";
import { dayHits, matchesAgent, matchesModel, matchesProject, modelLabel, sessionsInRange } from "./filter";
import { addDays, eachDay, type ResolvedRange } from "./range";

export type UsageDim = "project" | "agent" | "model";
export type TrendDim = "project" | "agent";
export type AttrView = "treemap" | "list";
export type UsageMode = "cost" | "token";
export type TokenKind = "all" | "input" | "output" | "cache";

export interface UsageSlice {
	name: string;
	color: string;
	cost: number;
	share: number;
}

export interface UsageDay {
	date: string;
	total: number;
	byName: Record<string, number>;
}

export interface UsageStats {
	totalCost: number;
	delta: number;
	credits: number;
	inputTokens: number;
	cachedTokens: number;
	outputTokens: number;
	dailyAvg: number;
	peakCost: number;
	peakDate: string;
	cacheHit: number;
	projectCount: number;
	modelCount: number;
	activeDays: number;
	days: UsageDay[];
	trend: Record<TrendDim, { slices: UsageSlice[]; days: UsageDay[] }>;
	attribution: Record<UsageDim, UsageSlice[]>;
}

const COLORS = [
	"#3b6cf0",
	"#7c3aed",
	"#f97316",
	"#fb923c",
	"#22c55e",
	"#16a34a",
	"#a3e635",
	"#4ade80",
	"#06b6d4",
	"#ec4899",
	"#8b5cf6",
	"#64748b",
];

function slicesOf(totals: Record<string, number>, extra = "其他"): UsageSlice[] {
	const ranked = Object.entries(totals)
		.filter(([, cost]) => cost > 0.0000005)
		.sort((left, right) => right[1] - left[1])
		.map(([name, cost], index) => ({ name, cost, color: COLORS[index % COLORS.length] ?? "#64748b" }));
	const featured = ranked.slice(0, 10);
	const rest = ranked.slice(10).reduce((sum, item) => sum + item.cost, 0);
	if (rest > 0.0000005) featured.push({ name: extra, cost: rest, color: "#94a3b8" });
	const total = featured.reduce((sum, item) => sum + item.cost, 0);
	return featured.map((item) => ({ ...item, share: total === 0 ? 0 : item.cost / total }));
}

export function tokenTotal(stats: UsageStats, kind: TokenKind = "all"): number {
	if (kind === "input") return stats.inputTokens;
	if (kind === "output") return stats.outputTokens;
	if (kind === "cache") return stats.cachedTokens;
	return stats.inputTokens + stats.cachedTokens + stats.outputTokens;
}

export function scaleMetric(
	days: UsageDay[],
	slices: UsageSlice[],
	scale: number,
): { days: UsageDay[]; slices: UsageSlice[] } {
	if (scale === 1) return { days, slices };
	return {
		days: days.map((day) => {
			const byName: Record<string, number> = {};
			let total = 0;
			for (const [name, value] of Object.entries(day.byName)) {
				const next = value * scale;
				byName[name] = next;
				total += next;
			}
			return { date: day.date, total, byName };
		}),
		slices: slices.map((item) => ({ ...item, cost: item.cost * scale })),
	};
}

function metricOf(session: AnalyseSession, start: string, end: string): { cost: number; input: number; output: number; cache: number } {
	const hits = dayHits(session, start, end);
	if (hits.length === 0) {
		return { cost: 0, input: 0, output: 0, cache: 0 };
	}
	const cost = hits.reduce((sum, day) => sum + day.cost, 0);
	const output = hits.reduce((sum, day) => sum + day.tokens, 0);
	const sessionCost = session.usage.cost;
	const share = sessionCost === 0 ? 0 : cost / sessionCost;
	return {
		cost,
		input: session.usage.input * share,
		output: output || session.usage.output * share,
		cache: session.usage.cacheRead * share,
	};
}

function rollup(
	sessions: AnalyseSession[],
	dates: string[],
	keyOf: (session: AnalyseSession) => string,
): { slices: UsageSlice[]; days: UsageDay[] } {
	const totals: Record<string, number> = {};
	const days = dates.map((date) => {
		const byName: Record<string, number> = {};
		let total = 0;
		for (const session of sessions) {
			const hit = session.days.find((day) => day.date === date);
			if (!hit || hit.cost === 0) continue;
			const name = keyOf(session);
			byName[name] = (byName[name] ?? 0) + hit.cost;
			totals[name] = (totals[name] ?? 0) + hit.cost;
			total += hit.cost;
		}
		return { date, total, byName };
	});
	const slices = slicesOf(totals);
	const featured = new Set(slices.map((item) => item.name).filter((name) => name !== "其他"));
	const collapsed = days.map((day) => {
		const byName: Record<string, number> = {};
		let other = 0;
		for (const [name, value] of Object.entries(day.byName)) {
			if (featured.has(name)) byName[name] = value;
			else other += value;
		}
		if (slices.some((item) => item.name === "其他")) byName["其他"] = other;
		return { date: day.date, total: day.total, byName };
	});
	return { slices, days: collapsed };
}

export function buildUsageStats(
	range: ResolvedRange,
	sessions: AnalyseSession[],
	models: ViewModelOption[],
	filters: { project: string; agent: string; model: string },
): UsageStats {
	const filtered = sessions.filter(
		(session) =>
			matchesProject(session, filters.project) &&
			matchesAgent(filters.agent) &&
			matchesModel(session, filters.model, models),
	);
	const current = sessionsInRange(filtered, range);
	const dates = eachDay(range.start, range.end);
	const span = dates.length;
	const prevEnd = addDays(range.start, -1);
	const prevStart = addDays(prevEnd, -(span - 1));
	const projectRollup = rollup(current, dates, (session) => session.project);
	const agentRollup = rollup(current, dates, () => "coding");
	const modelTotals: Record<string, number> = {};
	let inputTokens = 0;
	let outputTokens = 0;
	let cachedTokens = 0;
	let totalCost = 0;
	for (const session of current) {
		const metric = metricOf(session, range.start, range.end);
		totalCost += metric.cost;
		inputTokens += metric.input;
		outputTokens += metric.output;
		cachedTokens += metric.cache;
		const label = modelLabel(session, models);
		if (label !== "—") modelTotals[label] = (modelTotals[label] ?? 0) + metric.cost;
	}
	let prevCost = 0;
	for (const session of filtered) {
		prevCost += metricOf(session, prevStart, prevEnd).cost;
	}
	let peakCost = 0;
	let peakDate = range.start;
	for (const day of projectRollup.days) {
		if (day.total >= peakCost) {
			peakCost = day.total;
			peakDate = day.date;
		}
	}
	const activeDays = projectRollup.days.filter((day) => day.total > 0).length;
	return {
		totalCost,
		delta: prevCost === 0 ? (totalCost === 0 ? 0 : 1) : (totalCost - prevCost) / prevCost,
		credits: 0,
		inputTokens: Math.round(inputTokens),
		cachedTokens: Math.round(cachedTokens),
		outputTokens: Math.round(outputTokens),
		dailyAvg: totalCost / Math.max(1, activeDays),
		peakCost,
		peakDate,
		cacheHit: inputTokens + cachedTokens === 0 ? 0 : cachedTokens / (inputTokens + cachedTokens),
		projectCount: new Set(current.map((session) => session.project)).size,
		modelCount: Object.keys(modelTotals).length,
		activeDays,
		days: projectRollup.days,
		trend: {
			project: { slices: projectRollup.slices, days: projectRollup.days },
			agent: { slices: agentRollup.slices, days: agentRollup.days },
		},
		attribution: {
			project: projectRollup.slices,
			agent: agentRollup.slices,
			model: slicesOf(modelTotals),
		},
	};
}
