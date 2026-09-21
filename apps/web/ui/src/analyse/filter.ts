import type { AnalyseSession } from "@protocol/analyse";
import type { ViewModelOption } from "@protocol/view";
import { ymdShanghai, type ResolvedRange } from "./range";

export function sessionOverlaps(session: AnalyseSession, start: string, end: string): boolean {
	if (session.days.some((day) => day.date >= start && day.date <= end)) return true;
	if (session.startedAt === undefined) return false;
	const date = ymdShanghai(session.startedAt);
	return date >= start && date <= end;
}

export function sessionsInRange(sessions: AnalyseSession[], range: ResolvedRange): AnalyseSession[] {
	return sessions.filter((session) => sessionOverlaps(session, range.start, range.end));
}

export function matchesProject(session: AnalyseSession, filter: string): boolean {
	if (filter === "全部" || filter === "所有项目") return true;
	return session.project === filter;
}

export function matchesAgent(filter: string): boolean {
	return filter === "全部" || filter === "全部代理" || filter === "coding";
}

export function matchesModel(session: AnalyseSession, filter: string, models: ViewModelOption[]): boolean {
	if (filter === "全部") return true;
	const found = models.find((model) => model.name === filter);
	if (found) {
		return (
			session.modelId === found.modelId ||
			session.model === `${found.provider}/${found.modelId}` ||
			session.model === found.name
		);
	}
	return session.model === filter || session.modelId === filter;
}

export function modelLabel(session: AnalyseSession, models: ViewModelOption[]): string {
	const found = models.find(
		(model) =>
			model.modelId === session.modelId ||
			`${model.provider}/${model.modelId}` === session.model ||
			model.name === session.model,
	);
	return found?.name ?? (session.model || "—");
}

export function dayHits(session: AnalyseSession, start: string, end: string) {
	return session.days.filter((day) => day.date >= start && day.date <= end);
}
