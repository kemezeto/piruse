import { readFile } from "node:fs/promises";
import type { AnalyseDayHit, AnalyseSession, AnalyseSnapshot, AnalyseUsage } from "../../../protocol/src/analyse.ts";
import { projectName } from "./projects.ts";
import { titleFromPrompt } from "./titles.ts";

export interface AnalyseSessionFile {
	id: string;
	cwd: string;
	path: string;
	modifiedAt: number;
}

const SHANGHAI_DATE = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Shanghai",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const SHANGHAI_HOUR = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Asia/Shanghai",
	hour: "2-digit",
	hourCycle: "h23",
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function recordsOf(line: string): Record<string, unknown>[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return [];
	}
	const rows = Array.isArray(parsed) ? parsed : [parsed];
	return rows.filter(isRecord);
}

function worthParsing(line: string): boolean {
	return (
		line.includes('"kind":"entry"') ||
		line.includes('"kind":"usage"') ||
		line.includes('"kind":"value"') ||
		line.includes('"kind":"header"')
	);
}

export function ymdShanghai(ms: number): string {
	return SHANGHAI_DATE.format(new Date(ms));
}

export function hourShanghai(ms: number): number {
	return Number(SHANGHAI_HOUR.format(new Date(ms)));
}

function emptyHours(): number[] {
	return Array.from({ length: 24 }, () => 0);
}

function emptyUsage(): AnalyseUsage {
	return { input: 0, output: 0, cacheRead: 0, cost: 0 };
}

function addUsage(into: AnalyseUsage, usage: AnalyseUsage): void {
	into.input += usage.input;
	into.output += usage.output;
	into.cacheRead += usage.cacheRead;
	into.cost += usage.cost;
}

function readUsage(value: unknown): AnalyseUsage | undefined {
	if (!isRecord(value)) return undefined;
	const cost = isRecord(value.cost) ? value.cost : {};
	return {
		input: numberOf(value.input),
		output: numberOf(value.output),
		cacheRead: numberOf(value.cacheRead),
		cost: numberOf(cost.total),
	};
}

function numberOf(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function userText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => isRecord(block) && block.type === "text")
		.map((block) => String((block as { text?: unknown }).text ?? ""))
		.join("");
}

function toolCallsOf(content: unknown): { name: string; id?: string }[] {
	if (!Array.isArray(content)) return [];
	const calls: { name: string; id?: string }[] = [];
	for (const block of content) {
		if (!isRecord(block) || block.type !== "toolCall") continue;
		if (typeof block.name !== "string" || !block.name) continue;
		calls.push({ name: block.name, id: typeof block.id === "string" ? block.id : undefined });
	}
	return calls;
}

interface DraftDay {
	date: string;
	messages: number;
	tokens: number;
	cost: number;
	tools: number;
	hours: number[];
	sessioned: boolean;
}

interface Draft {
	id: string;
	cwd: string;
	title?: string;
	firstUser?: string;
	provider: string;
	modelId: string;
	startedAt?: number;
	endedAt?: number;
	userMessages: number;
	assistantMessages: number;
	usage: AnalyseUsage;
	assistantUsage: AnalyseUsage;
	usageRows: number;
	aborted: boolean;
	failed: boolean;
	compaction: number;
	tools: Map<string, { calls: number; errors: number }>;
	days: Map<string, DraftDay>;
}

function dayOf(draft: Draft, at: number): DraftDay {
	const date = ymdShanghai(at);
	const current = draft.days.get(date);
	if (current) return current;
	const created: DraftDay = { date, messages: 0, tokens: 0, cost: 0, tools: 0, hours: emptyHours(), sessioned: false };
	draft.days.set(date, created);
	return created;
}

function touchTime(draft: Draft, at: number): void {
	draft.startedAt = draft.startedAt === undefined ? at : Math.min(draft.startedAt, at);
	draft.endedAt = draft.endedAt === undefined ? at : Math.max(draft.endedAt, at);
}

function bumpTool(draft: Draft, name: string, field: "calls" | "errors"): void {
	const current = draft.tools.get(name) ?? { calls: 0, errors: 0 };
	current[field] += 1;
	draft.tools.set(name, current);
}

function ingestMessage(draft: Draft, message: Record<string, unknown>, fallbackAt: number): number {
	const at = typeof message.timestamp === "number" ? message.timestamp : fallbackAt;
	touchTime(draft, at);
	const day = dayOf(draft, at);
	day.sessioned = true;
	if (message.role === "user") {
		draft.userMessages += 1;
		day.messages += 1;
		day.hours[hourShanghai(at)] += 1;
		if (!draft.firstUser) {
			const title = titleFromPrompt(userText(message.content));
			if (title) draft.firstUser = title;
		}
		return at;
	}
	if (message.role === "assistant") {
		draft.assistantMessages += 1;
		day.messages += 1;
		day.hours[hourShanghai(at)] += 1;
		if (typeof message.provider === "string" && message.provider) draft.provider = message.provider;
		if (typeof message.model === "string" && message.model) draft.modelId = message.model;
		if (message.stopReason === "aborted") draft.aborted = true;
		const usage = readUsage(message.usage);
		if (usage) addUsage(draft.assistantUsage, usage);
		for (const call of toolCallsOf(message.content)) {
			bumpTool(draft, call.name, "calls");
			day.tools += 1;
		}
		return at;
	}
	if (message.role === "toolResult") {
		const name = typeof message.toolName === "string" ? message.toolName : "tool";
		if (message.isError === true) bumpTool(draft, name, "errors");
		return at;
	}
	return at;
}

function ingestValue(draft: Draft, record: Record<string, unknown>): void {
	if (record.op === "delete") return;
	if (record.namespace === "pi.session.name" && typeof record.value === "string") {
		const title = titleFromPrompt(record.value);
		if (title) draft.title = title;
		return;
	}
	if (record.namespace === "pi.lane.config" && isRecord(record.value) && isRecord(record.value.model)) {
		const model = record.value.model;
		if (typeof model.provider === "string" && model.provider) draft.provider = model.provider;
		if (typeof model.modelId === "string" && model.modelId) draft.modelId = model.modelId;
		return;
	}
	if (record.namespace === "pi.result" && isRecord(record.value)) {
		if (record.value.status === "aborted") draft.aborted = true;
		if (record.value.status === "failed") draft.failed = true;
	}
}

export function parseSessionJsonl(
	content: string,
	file: AnalyseSessionFile,
	title?: string,
): AnalyseSession {
	const draft: Draft = {
		id: file.id,
		cwd: file.cwd,
		title,
		provider: "",
		modelId: "",
		usage: emptyUsage(),
		assistantUsage: emptyUsage(),
		usageRows: 0,
		aborted: false,
		failed: false,
		compaction: 0,
		userMessages: 0,
		assistantMessages: 0,
		tools: new Map(),
		days: new Map(),
	};

	for (const line of content.split("\n")) {
		if (!line || !worthParsing(line)) continue;
		const records = recordsOf(line);
		if (records.length === 0) continue;
		const header = records.find((row) => row.kind === "header");
		if (header) {
			if (typeof header.id === "string" && header.id) draft.id = header.id;
			if (typeof header.cwd === "string" && header.cwd) draft.cwd = header.cwd;
		}
		let lastAt = draft.endedAt ?? file.modifiedAt;
		for (const record of records) {
			if (record.kind !== "entry") continue;
			if (record.type === "compaction") {
				draft.compaction += 1;
				const at = typeof record.timestamp === "number" ? record.timestamp : lastAt;
				touchTime(draft, at);
				continue;
			}
			if (record.type !== "message" || !isRecord(record.message)) continue;
			const at = typeof record.timestamp === "number" ? record.timestamp : lastAt;
			lastAt = ingestMessage(draft, record.message, at);
		}
		for (const record of records) {
			if (record.kind !== "usage") continue;
			const usage = readUsage(record.usage);
			if (!usage) continue;
			draft.usageRows += 1;
			addUsage(draft.usage, usage);
			const day = dayOf(draft, lastAt);
			day.tokens += usage.output;
			day.cost += usage.cost;
			day.sessioned = true;
		}
		for (const record of records) {
			if (record.kind === "value") ingestValue(draft, record);
		}
	}

	const usage = draft.usageRows > 0 ? draft.usage : draft.assistantUsage;
	if (draft.usageRows === 0 && draft.startedAt !== undefined && usage.output + usage.cost > 0) {
		const day = dayOf(draft, draft.endedAt ?? draft.startedAt);
		if (day.tokens === 0) day.tokens = usage.output;
		if (day.cost === 0) day.cost = usage.cost;
	}

	const model = draft.provider && draft.modelId ? `${draft.provider}/${draft.modelId}` : draft.modelId || draft.provider;
	const tools = [...draft.tools.entries()]
		.map(([name, item]) => ({ name, calls: item.calls, errors: item.errors }))
		.sort((left, right) => right.calls - left.calls || left.name.localeCompare(right.name));
	const durationMs =
		draft.startedAt !== undefined && draft.endedAt !== undefined ? Math.max(0, draft.endedAt - draft.startedAt) : 0;

	return {
		id: draft.id,
		title: draft.title || title || draft.firstUser || draft.id.slice(0, 8),
		project: projectName(draft.cwd),
		cwd: draft.cwd,
		provider: draft.provider,
		modelId: draft.modelId,
		model,
		startedAt: draft.startedAt,
		endedAt: draft.endedAt,
		userMessages: draft.userMessages,
		assistantMessages: draft.assistantMessages,
		messages: draft.userMessages + draft.assistantMessages,
		usage,
		durationMin: durationMs / 60_000,
		aborted: draft.aborted,
		failed: draft.failed,
		compaction: draft.compaction,
		toolCalls: tools.reduce((sum, item) => sum + item.calls, 0),
		toolErrors: tools.reduce((sum, item) => sum + item.errors, 0),
		tools,
		days: [...draft.days.values()]
			.filter((day) => day.sessioned || day.messages > 0 || day.tools > 0 || day.tokens > 0 || day.cost > 0)
			.sort((left, right) => left.date.localeCompare(right.date)),
	};
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let cursor = 0;
	async function worker(): Promise<void> {
		while (true) {
			const index = cursor;
			cursor += 1;
			if (index >= items.length) return;
			out[index] = await fn(items[index]!);
		}
	}
	const workers = Math.min(Math.max(1, limit), Math.max(1, items.length));
	await Promise.all(Array.from({ length: workers }, () => worker()));
	return out;
}

export async function loadAnalyseSnapshot(
	files: AnalyseSessionFile[],
	titles: Map<string, string>,
	now = Date.now(),
): Promise<AnalyseSnapshot> {
	const sessions = await mapPool(files, 8, async (file) => {
		try {
			const content = await readFile(file.path, "utf8");
			return parseSessionJsonl(content, file, titles.get(file.id));
		} catch {
			return parseSessionJsonl("", file, titles.get(file.id));
		}
	});
	sessions.sort((left, right) => (right.endedAt ?? 0) - (left.endedAt ?? 0) || left.id.localeCompare(right.id));
	return { generatedAt: now, sessions };
}
