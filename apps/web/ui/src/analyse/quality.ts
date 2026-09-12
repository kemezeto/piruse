import type { ViewProjectOption } from "@protocol/view";
import { eachDay, parseYmd, type ResolvedRange } from "./range";

export type Grade = "A" | "B" | "C" | "D" | "F";
export type SessionOutcome = "completed" | "abandoned" | "unknown";

export const GRADES: Grade[] = ["A", "B", "C", "D", "F"];

export const GRADE_COLOR: Record<Grade, string> = {
	A: "#b7e9c9",
	B: "#c9ddf7",
	C: "#efe4aa",
	D: "#f3d0a6",
	F: "#f0c2c2",
};

export const OUTCOME_META: { id: SessionOutcome; label: string; color: string }[] = [
	{ id: "completed", label: "completed", color: "#22c55e" },
	{ id: "abandoned", label: "abandoned", color: "#f59e0b" },
	{ id: "unknown", label: "unknown", color: "#94a3b8" },
];

export interface QualityDay {
	date: string;
	score: number;
	grade: Grade;
	sessions: number;
}

export interface QualityGroup {
	name: string;
	sessions: number;
	avgScore: number;
	completed: number;
}

export interface QualityStats {
	avgScore: number;
	grade: Grade;
	completedRate: number;
	completedCount: number;
	errorRate: number;
	errorCount: number;
	toolFailRate: number;
	toolFailCount: number;
	compaction: number;
	compactionPerSession: number;
	grades: { grade: Grade; count: number }[];
	outcomes: { id: SessionOutcome; label: string; color: string; count: number }[];
	days: QualityDay[];
	projects: QualityGroup[];
	sessions: number;
}

const FALLBACK_PROJECTS = [
	"pgci_frontend",
	"empty_window",
	"new_work",
	"mes_system",
	"com_web",
	"host_com_web",
	"pgci_analyse_system",
	"agent_fac",
	"new_chat",
	"piruse",
	"kernel",
];

export function gradeOf(score: number): Grade {
	if (score >= 90) return "A";
	if (score >= 80) return "B";
	if (score >= 70) return "C";
	if (score >= 60) return "D";
	return "F";
}

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

function uniqueNames(preferred: string[], fallback: string[]): string[] {
	const names: string[] = [];
	for (const name of [...preferred, ...fallback]) {
		if (!name || names.includes(name)) continue;
		names.push(name);
	}
	return names.length > 0 ? names : fallback.slice();
}

function rollScore(random: () => number): number {
	const bag = random();
	if (bag < 0.84) return 90 + random() * 10;
	if (bag < 0.96) return 80 + random() * 10;
	if (bag < 0.99) return 70 + random() * 10;
	if (bag < 0.997) return 60 + random() * 10;
	return 40 + random() * 20;
}

function rollOutcome(random: () => number): SessionOutcome {
	const bag = random();
	if (bag < 0.9) return "completed";
	if (bag < 0.93) return "abandoned";
	return "unknown";
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupOf(
	rows: { name: string; score: number; outcome: SessionOutcome }[],
): QualityGroup[] {
	const map = new Map<string, { scores: number[]; completed: number }>();
	for (const row of rows) {
		const current = map.get(row.name) ?? { scores: [], completed: 0 };
		current.scores.push(row.score);
		if (row.outcome === "completed") current.completed += 1;
		map.set(row.name, current);
	}
	return [...map.entries()]
		.map(([name, item]) => ({
			name,
			sessions: item.scores.length,
			avgScore: avg(item.scores),
			completed: item.scores.length === 0 ? 0 : item.completed / item.scores.length,
		}))
		.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export function buildQualityStats(range: ResolvedRange, projects: ViewProjectOption[]): QualityStats {
	const random = rng(hash(`${range.start}:${range.end}:quality`));
	const dates = eachDay(range.start, range.end);
	const projectNames = uniqueNames(
		projects.map((item) => item.name),
		FALLBACK_PROJECTS,
	);
	const projectWeight = projectNames.map((_, index) => Math.pow(projectNames.length - index, 1.25));
	const projectSum = projectWeight.reduce((sum, value) => sum + value, 0);

	function pick(names: string[], weights: number[], sum: number): string {
		let cursor = random() * sum;
		for (let index = 0; index < names.length; index += 1) {
			cursor -= weights[index] ?? 0;
			if (cursor <= 0) return names[index] ?? names[0]!;
		}
		return names[0]!;
	}

	const sessions: {
		date: string;
		score: number;
		outcome: SessionOutcome;
		project: string;
		toolFail: boolean;
		error: boolean;
		compaction: boolean;
	}[] = [];

	dates.forEach((date, index) => {
		const weekday = parseYmd(date).getDay();
		const weekend = weekday === 0 || weekday === 6 ? 0.22 : 1;
		const recency = 0.55 + (index / Math.max(1, dates.length - 1)) * 0.45;
		if (random() > 0.92 * weekend) return;
		const count = Math.max(1, Math.round((1.1 + random() * 2.2) * weekend * recency));
		for (let item = 0; item < count; item += 1) {
			const score = rollScore(random);
			const outcome = rollOutcome(random);
			sessions.push({
				date,
				score,
				outcome,
				project: pick(projectNames, projectWeight, projectSum),
				toolFail: random() < 0.08,
				error: random() < 0.004,
				compaction: random() < 0.065,
			});
		}
	});

	const scores = sessions.map((item) => item.score);
	const avgScore = avg(scores);
	const completedCount = sessions.filter((item) => item.outcome === "completed").length;
	const errorCount = sessions.filter((item) => item.error).length;
	const toolFailCount = sessions.filter((item) => item.toolFail).length;
	const compaction = sessions.filter((item) => item.compaction).length;
	const total = sessions.length;
	const gradeCounts = Object.fromEntries(GRADES.map((grade) => [grade, 0])) as Record<Grade, number>;
	for (const item of sessions) gradeCounts[gradeOf(item.score)] += 1;
	const outcomeCounts = Object.fromEntries(OUTCOME_META.map((item) => [item.id, 0])) as Record<SessionOutcome, number>;
	for (const item of sessions) outcomeCounts[item.outcome] += 1;

	const byDate = new Map<string, number[]>();
	for (const item of sessions) {
		const list = byDate.get(item.date) ?? [];
		list.push(item.score);
		byDate.set(item.date, list);
	}
	const days: QualityDay[] = dates
		.map((date) => {
			const list = byDate.get(date);
			if (!list || list.length === 0) return null;
			const score = avg(list);
			return { date, score, grade: gradeOf(score), sessions: list.length };
		})
		.filter((item): item is QualityDay => item !== null);

	return {
		avgScore,
		grade: gradeOf(avgScore),
		completedRate: total === 0 ? 0 : completedCount / total,
		completedCount,
		errorRate: total === 0 ? 0 : errorCount / total,
		errorCount,
		toolFailRate: total === 0 ? 0 : toolFailCount / total,
		toolFailCount,
		compaction,
		compactionPerSession: total === 0 ? 0 : compaction / total,
		grades: GRADES.map((grade) => ({ grade, count: gradeCounts[grade] })),
		outcomes: OUTCOME_META.map((item) => ({ ...item, count: outcomeCounts[item.id] })),
		days,
		projects: groupOf(sessions.map((item) => ({ name: item.project, score: item.score, outcome: item.outcome }))),
		sessions: total,
	};
}
