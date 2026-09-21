import type { AnalyseSession } from "@protocol/analyse";
import { sessionsInRange } from "./filter";
import { eachDay, type ResolvedRange } from "./range";

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

export function gradeOf(score: number): Grade {
	if (score >= 90) return "A";
	if (score >= 80) return "B";
	if (score >= 70) return "C";
	if (score >= 60) return "D";
	return "F";
}

function outcomeOf(session: AnalyseSession): SessionOutcome {
	if (session.aborted) return "abandoned";
	if (session.assistantMessages > 0 && !session.failed) return "completed";
	return "unknown";
}

function scoreOf(session: AnalyseSession): number {
	if (session.failed) return 40;
	if (session.aborted) return 55;
	if (session.assistantMessages === 0) return 0;
	if (session.toolErrors > 0) return 80;
	return 95;
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupOf(rows: { name: string; score: number; outcome: SessionOutcome }[]): QualityGroup[] {
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
		.sort((left, right) => right.sessions - left.sessions || left.name.localeCompare(right.name));
}

export function buildQualityStats(range: ResolvedRange, sessions: AnalyseSession[]): QualityStats {
	const filtered = sessionsInRange(sessions, range);
	const dated = filtered.map((session) => {
		const date =
			session.days.find((day) => day.date >= range.start && day.date <= range.end)?.date ?? session.days[0]?.date;
		return { session, date, score: scoreOf(session), outcome: outcomeOf(session) };
	});
	const scores = dated.map((item) => item.score).filter((score) => score > 0);
	const avgScore = avg(scores);
	const completedCount = dated.filter((item) => item.outcome === "completed").length;
	const errorCount = dated.filter((item) => item.session.failed).length;
	const toolFailCount = dated.filter((item) => item.session.toolErrors > 0).length;
	const compaction = dated.reduce((sum, item) => sum + item.session.compaction, 0);
	const total = dated.length;
	const gradeCounts = Object.fromEntries(GRADES.map((grade) => [grade, 0])) as Record<Grade, number>;
	for (const item of dated) {
		if (item.score <= 0) continue;
		gradeCounts[gradeOf(item.score)] += 1;
	}
	const outcomeCounts = Object.fromEntries(OUTCOME_META.map((item) => [item.id, 0])) as Record<SessionOutcome, number>;
	for (const item of dated) outcomeCounts[item.outcome] += 1;
	const byDate = new Map<string, number[]>();
	for (const item of dated) {
		if (!item.date) continue;
		const list = byDate.get(item.date) ?? [];
		list.push(item.score > 0 ? item.score : item.outcome === "completed" ? 95 : 0);
		byDate.set(item.date, list);
	}
	const days: QualityDay[] = eachDay(range.start, range.end)
		.map((date) => {
			const list = byDate.get(date);
			if (!list || list.length === 0) return null;
			const score = avg(list.filter((value) => value > 0));
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
		projects: groupOf(dated.map((item) => ({ name: item.session.project, score: item.score, outcome: item.outcome }))),
		sessions: total,
	};
}
