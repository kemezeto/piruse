import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isPermissionMode, type PermissionMode } from "../tools/policy.ts";

const MAX_PREFIXES = 50;

export interface StoredPermissions {
	mode?: PermissionMode;
	bashPrefixes: string[];
}

function permissionsPath(sessionsRoot: string): string {
	return join(dirname(sessionsRoot), "permissions.json");
}

function asPrefixes(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const prefixes: string[] = [];
	for (const entry of value) {
		if (typeof entry !== "string") continue;
		const prefix = entry.trim();
		if (prefix) prefixes.push(prefix);
	}
	return prefixes.slice(0, MAX_PREFIXES);
}

function parseProject(value: unknown): StoredPermissions {
	if (isPermissionMode(value)) return { mode: value, bashPrefixes: [] };
	if (!value || typeof value !== "object" || Array.isArray(value)) return { bashPrefixes: [] };
	const record = value as Record<string, unknown>;
	return {
		mode: isPermissionMode(record.mode) ? record.mode : undefined,
		bashPrefixes: asPrefixes(record.bashPrefixes),
	};
}

async function loadFile(sessionsRoot: string): Promise<Record<string, StoredPermissions>> {
	try {
		const parsed: unknown = JSON.parse(await readFile(permissionsPath(sessionsRoot), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const data: Record<string, StoredPermissions> = {};
		for (const [cwd, value] of Object.entries(parsed as Record<string, unknown>)) {
			data[cwd] = parseProject(value);
		}
		return data;
	} catch {
		return {};
	}
}

function serialize(data: Record<string, StoredPermissions>): Record<string, PermissionMode | StoredPermissions> {
	const out: Record<string, PermissionMode | StoredPermissions> = {};
	for (const [cwd, stored] of Object.entries(data)) {
		if (stored.bashPrefixes.length === 0 && stored.mode) out[cwd] = stored.mode;
		else out[cwd] = stored;
	}
	return out;
}

async function saveFile(sessionsRoot: string, data: Record<string, StoredPermissions>): Promise<void> {
	const path = permissionsPath(sessionsRoot);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(serialize(data), null, 2)}\n`, "utf8");
}

export async function readStoredPermissions(sessionsRoot: string, cwd: string): Promise<StoredPermissions> {
	return (await loadFile(sessionsRoot))[cwd] ?? { bashPrefixes: [] };
}

export async function readPermissionMode(sessionsRoot: string, cwd: string): Promise<PermissionMode | undefined> {
	return (await readStoredPermissions(sessionsRoot, cwd)).mode;
}

export async function writePermissionMode(sessionsRoot: string, cwd: string, mode: PermissionMode): Promise<void> {
	const data = await loadFile(sessionsRoot);
	const current = data[cwd] ?? { bashPrefixes: [] };
	data[cwd] = { ...current, mode };
	await saveFile(sessionsRoot, data);
}

export async function addBashPrefix(sessionsRoot: string, cwd: string, prefix: string): Promise<string[]> {
	const trimmed = prefix.trim();
	if (!trimmed) return (await readStoredPermissions(sessionsRoot, cwd)).bashPrefixes;
	const data = await loadFile(sessionsRoot);
	const current = data[cwd] ?? { bashPrefixes: [] };
	const bashPrefixes = current.bashPrefixes.includes(trimmed)
		? current.bashPrefixes
		: [...current.bashPrefixes, trimmed].slice(-MAX_PREFIXES);
	data[cwd] = { ...current, bashPrefixes };
	await saveFile(sessionsRoot, data);
	return bashPrefixes;
}
