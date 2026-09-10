import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ArchivedSessionRecord {
	archivedAt: number;
	title: string;
	cwd: string;
}

export type ArchiveIndex = Record<string, ArchivedSessionRecord>;

export function archiveIndexPath(sessionsRoot: string): string {
	return join(dirname(sessionsRoot), "archived.json");
}

export async function readArchiveIndex(sessionsRoot: string): Promise<ArchiveIndex> {
	try {
		const parsed: unknown = JSON.parse(await readFile(archiveIndexPath(sessionsRoot), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const data: ArchiveIndex = {};
		for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (!value || typeof value !== "object" || Array.isArray(value)) continue;
			const record = value as Record<string, unknown>;
			if (typeof record.archivedAt !== "number" || typeof record.title !== "string" || typeof record.cwd !== "string") {
				continue;
			}
			data[id] = { archivedAt: record.archivedAt, title: record.title, cwd: record.cwd };
		}
		return data;
	} catch {
		return {};
	}
}

export async function writeArchiveIndex(sessionsRoot: string, data: ArchiveIndex): Promise<void> {
	const path = archiveIndexPath(sessionsRoot);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function isArchived(index: ArchiveIndex, sessionId: string): boolean {
	return Object.hasOwn(index, sessionId);
}
