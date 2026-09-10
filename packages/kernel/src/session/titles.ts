import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { shortId } from "./open.ts";

export const SESSION_NAME_NAMESPACE = "pi.session.name";
export const TITLE_MAX_LENGTH = 80;

export type TitleIndex = Record<string, string>;

export function titleIndexPath(sessionsRoot: string): string {
	return join(dirname(sessionsRoot), "titles.json");
}

export function sanitizeTitle(text: string): string {
	return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_LENGTH);
}

export function titleFromPrompt(text: string): string {
	const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? text;
	return sanitizeTitle(firstLine);
}

export async function readTitleIndex(sessionsRoot: string): Promise<TitleIndex> {
	try {
		const parsed: unknown = JSON.parse(await readFile(titleIndexPath(sessionsRoot), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const data: TitleIndex = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value !== "string") continue;
			const title = sanitizeTitle(value);
			if (title) data[id] = title;
		}
		return data;
	} catch {
		return {};
	}
}

export async function writeTitleIndex(sessionsRoot: string, data: TitleIndex): Promise<void> {
	const path = titleIndexPath(sessionsRoot);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function displayTitle(id: string, ...candidates: Array<string | undefined>): string {
	for (const candidate of candidates) {
		const title = candidate?.trim();
		if (title && title !== shortId(id)) return title;
	}
	for (const candidate of candidates) {
		const title = candidate?.trim();
		if (title) return title;
	}
	return shortId(id);
}

export async function discoverTitleFromJsonl(path: string): Promise<string | undefined> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		return undefined;
	}
	let named: string | undefined;
	let firstUser: string | undefined;
	for (const line of content.split("\n")) {
		if (!line) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		const records = Array.isArray(parsed) ? parsed : [parsed];
		for (const record of records) {
			if (!record || typeof record !== "object" || Array.isArray(record)) continue;
			const row = record as Record<string, unknown>;
			if (row.kind === "value" && row.namespace === SESSION_NAME_NAMESPACE) {
				if (row.op === "delete") named = undefined;
				else if (row.op === "set" && typeof row.value === "string") {
					named = titleFromPrompt(row.value) || undefined;
				}
			}
			if (!firstUser && row.kind === "entry") {
				firstUser = userMessageTitle(row.message);
			}
		}
	}
	return named || firstUser;
}

function userMessageTitle(message: unknown): string | undefined {
	if (!message || typeof message !== "object" || Array.isArray(message)) return undefined;
	const row = message as Record<string, unknown>;
	if (row.role !== "user") return undefined;
	const content = row.content;
	if (typeof content === "string") return titleFromPrompt(content) || undefined;
	if (!Array.isArray(content)) return undefined;
	const text = content
		.filter((block) => block && typeof block === "object" && (block as { type?: unknown }).type === "text")
		.map((block) => String((block as { text?: unknown }).text ?? ""))
		.join("");
	return titleFromPrompt(text) || undefined;
}
