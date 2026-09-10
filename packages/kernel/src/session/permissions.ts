import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isPermissionMode, type PermissionMode } from "../tools/policy.ts";

function permissionsPath(sessionsRoot: string): string {
	return join(dirname(sessionsRoot), "permissions.json");
}

async function loadFile(sessionsRoot: string): Promise<Record<string, PermissionMode>> {
	try {
		const parsed: unknown = JSON.parse(await readFile(permissionsPath(sessionsRoot), "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const data: Record<string, PermissionMode> = {};
		for (const [cwd, mode] of Object.entries(parsed as Record<string, unknown>)) {
			if (isPermissionMode(mode)) data[cwd] = mode;
		}
		return data;
	} catch {
		return {};
	}
}

export async function readPermissionMode(sessionsRoot: string, cwd: string): Promise<PermissionMode | undefined> {
	return (await loadFile(sessionsRoot))[cwd];
}

export async function writePermissionMode(sessionsRoot: string, cwd: string, mode: PermissionMode): Promise<void> {
	const path = permissionsPath(sessionsRoot);
	const data = await loadFile(sessionsRoot);
	data[cwd] = mode;
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
