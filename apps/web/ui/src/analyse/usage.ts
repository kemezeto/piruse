import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { eachDay, parseYmd, type ResolvedRange } from "./range";

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

const FALLBACK_PROJECTS = [
	"YL-n",
	"new_chat",
	"fen",
	"port_48080_was_already_in_use",
	"cursor_localization_zh_main",
	"蒲川翔_分布式",
	"looking",
	"xl_n",
	"base_itby20260307_desktop_cOsp7k_new_work",
	"realtime_voice_chat",
	"kernel",
	"piruse",
];

const FALLBACK_AGENTS = ["cursor", "coding", "analyse", "copilot"];
const FALLBACK_MODELS = ["gpt-5", "claude-sonnet", "gemini-2.5", "gpt-4.1", "composer", "grok-4", "codex"];

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

function uniqueNames(preferred: string[], fallback: string[], limit: number): string[] {
	const names: string[] = [];
	for (const name of [...preferred, ...fallback]) {
		if (!name || names.includes(name)) continue;
		names.push(name);
		if (names.length >= limit) break;
	}
	return names.length > 0 ? names : fallback.slice(0, limit);
}

function weights(count: number, random: () => number, steep = 1.35): number[] {
	const raw = Array.from({ length: count }, (_, index) => Math.pow(count - index, steep) * (0.72 + random() * 0.4));
	const sum = raw.reduce((total, value) => total + value, 0);
	return raw.map((value) => value / sum);
}

function slicesOf(names: string[], totals: Record<string, number>, extra = "其他"): UsageSlice[] {
	const ranked = names
		.map((name, index) => ({ name, cost: totals[name] ?? 0, color: COLORS[index % COLORS.length] ?? "#64748b" }))
		.filter((item) => item.cost > 0.0005)
		.sort((a, b) => b.cost - a.cost);
	const featured = ranked.slice(0, 10);
	const rest = ranked.slice(10).reduce((sum, item) => sum + item.cost, 0);
	if (rest > 0.0005) featured.push({ name: extra, cost: rest, color: "#94a3b8" });
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

function rollup(
	names: string[],
	dates: string[],
	share: number[],
	dayCost: number[],
	random: () => number,
): { slices: UsageSlice[]; days: UsageDay[] } {
	const totals: Record<string, number> = Object.fromEntries(names.map((name) => [name, 0]));
	const days = dates.map((date, index) => {
		const byName: Record<string, number> = {};
		let total = 0;
		names.forEach((name, nameIndex) => {
			const wobble = 0.55 + random() * 0.9;
			const value = dayCost[index]! * share[nameIndex]! * wobble;
			byName[name] = value;
			totals[name] = (totals[name] ?? 0) + value;
			total += value;
		});
		return { date, total, byName };
	});
	const slices = slicesOf(names, totals);
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
	projects: ViewProjectOption[],
	models: ViewModelOption[],
	filters: { project: string; agent: string; model: string },
): UsageStats {
	const random = rng(hash(`${range.start}:${range.end}:${filters.project}:${filters.agent}:${filters.model}`));
	const dates = eachDay(range.start, range.end);
	const span = Math.max(1, dates.length);
	const factor =
		(filters.project === "全部" ? 1 : 0.34) *
		(filters.agent === "全部" ? 1 : 0.42) *
		(filters.model === "全部" ? 1 : 0.38);

	const projectNames = uniqueNames(
		projects.map((item) => item.name),
		FALLBACK_PROJECTS,
		14,
	);
	const agentNames = uniqueNames([], FALLBACK_AGENTS, 4);
	const modelNames = uniqueNames(
		models.map((item) => item.name),
		FALLBACK_MODELS,
		7,
	);

	const dayCost = dates.map((date, index) => {
		const weekday = parseYmd(date).getDay();
		const weekend = weekday === 0 || weekday === 6 ? 0.18 : 1;
		const decay = Math.exp(-3.1 * (index / span));
		const burst = index < 2 ? 2.05 : 1;
		const quiet = index > span * 0.72 ? 0.12 : 1;
		return Math.max(0, (1.32 * decay * weekend * burst * quiet + random() * 0.035) * factor);
	});

	const projectShare = weights(projectNames.length, random, 1.7);
	const agentShare = weights(agentNames.length, random, 1.15);
	const modelShare = weights(modelNames.length, random, 1.25);
	const projectRollup = rollup(projectNames, dates, projectShare, dayCost, random);
	const agentRollup = rollup(agentNames, dates, agentShare, dayCost, random);
	const modelTotals: Record<string, number> = {};
	const totalCost = projectRollup.days.reduce((sum, day) => sum + day.total, 0);
	modelNames.forEach((name, index) => {
		modelTotals[name] = totalCost * (modelShare[index] ?? 0);
	});

	let peakCost = 0;
	let peakDate = range.start;
	for (const day of projectRollup.days) {
		if (day.total >= peakCost) {
			peakCost = day.total;
			peakDate = day.date;
		}
	}

	const activeDays = projectRollup.days.filter((day) => day.total > Math.max(0.28, peakCost * 0.16)).length;
	const inputTokens = Math.round(totalCost * 186_000);
	const cachedTokens = Math.round(inputTokens * (2.35 + random() * 0.4));
	const outputTokens = Math.round(totalCost * 11_500);
	const prevCost = totalCost * (4.8 + random() * 1.4);

	return {
		totalCost,
		delta: prevCost === 0 ? 0 : (totalCost - prevCost) / prevCost,
		credits: Math.max(1, Math.round(2 + random() * 4)),
		inputTokens,
		cachedTokens,
		outputTokens,
		dailyAvg: totalCost / Math.max(1, activeDays),
		peakCost,
		peakDate,
		cacheHit: inputTokens + cachedTokens === 0 ? 0 : cachedTokens / (inputTokens + cachedTokens),
		projectCount: projectNames.length,
		modelCount: modelNames.length,
		activeDays,
		days: projectRollup.days,
		trend: {
			project: { slices: projectRollup.slices, days: projectRollup.days },
			agent: { slices: agentRollup.slices, days: agentRollup.days },
		},
		attribution: {
			project: projectRollup.slices,
			agent: agentRollup.slices,
			model: slicesOf(modelNames, modelTotals),
		},
	};
}
