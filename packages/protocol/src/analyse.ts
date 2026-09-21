/** Cross-session ledger for Analyse. No harness types. */

export interface AnalyseUsage {
	input: number;
	output: number;
	cacheRead: number;
	cost: number;
}

export interface AnalyseToolCount {
	name: string;
	calls: number;
	errors: number;
}

export interface AnalyseDayHit {
	date: string;
	messages: number;
	tokens: number;
	cost: number;
	tools: number;
	hours: number[];
}

export interface AnalyseSession {
	id: string;
	title: string;
	project: string;
	cwd: string;
	provider: string;
	modelId: string;
	model: string;
	startedAt?: number;
	endedAt?: number;
	userMessages: number;
	assistantMessages: number;
	messages: number;
	usage: AnalyseUsage;
	durationMin: number;
	aborted: boolean;
	failed: boolean;
	compaction: number;
	toolCalls: number;
	toolErrors: number;
	tools: AnalyseToolCount[];
	days: AnalyseDayHit[];
}

export interface AnalyseSnapshot {
	generatedAt: number;
	sessions: AnalyseSession[];
}
