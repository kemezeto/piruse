import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { getOrThrow, type Context, type JsonlSessionMetadata } from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { ViewProjectOption } from "../../../protocol/src/view.ts";

export function expandUserPath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

export function projectName(cwd: string): string {
	return basename(cwd) || cwd;
}

export function lastProjectPath(sessionsRoot: string): string {
	return join(dirname(sessionsRoot), "last-project");
}

export async function readLastProject(sessionsRoot: string): Promise<string | undefined> {
	try {
		const cwd = (await readFile(lastProjectPath(sessionsRoot), "utf8")).trim();
		if (!cwd) return undefined;
		const info = await stat(cwd);
		return info.isDirectory() ? cwd : undefined;
	} catch {
		return undefined;
	}
}

export async function writeLastProject(sessionsRoot: string, cwd: string): Promise<void> {
	const path = lastProjectPath(sessionsRoot);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${cwd}\n`, "utf8");
}

export async function resolveBootCwd(options: {
	explicit?: string;
	sessionsRoot: string;
	fallback: string;
}): Promise<string> {
	if (options.explicit?.trim()) {
		const cwd = resolve(expandUserPath(options.explicit.trim()));
		const info = await stat(cwd);
		if (!info.isDirectory()) throw new Error(`Not a directory: ${cwd}`);
		return cwd;
	}
	return (await readLastProject(options.sessionsRoot)) ?? resolve(options.fallback);
}

export function projectsFromSessions(sessions: JsonlSessionMetadata[], currentCwd: string): ViewProjectOption[] {
	const byCwd = new Map<string, ViewProjectOption>();
	for (const session of sessions) {
		const current = byCwd.get(session.cwd);
		if (!current) {
			byCwd.set(session.cwd, {
				cwd: session.cwd,
				name: projectName(session.cwd),
				sessionCount: 1,
				modifiedAt: session.modifiedAt,
				sessions: [],
			});
			continue;
		}
		current.sessionCount += 1;
		if (session.modifiedAt > current.modifiedAt) current.modifiedAt = session.modifiedAt;
	}
	if (!byCwd.has(currentCwd)) {
		byCwd.set(currentCwd, {
			cwd: currentCwd,
			name: projectName(currentCwd),
			sessionCount: 0,
			modifiedAt: Date.now(),
			sessions: [],
		});
	}
	return [...byCwd.values()].sort((left, right) => left.name.localeCompare(right.name) || left.cwd.localeCompare(right.cwd)).slice(0, 40);
}

export async function resolveProjectDirectory(env: NodeExecutionEnv, cwdInput: string, context: Context): Promise<string> {
	const trimmed = cwdInput.trim();
	if (!trimmed) throw new Error("Project path is required");
	const resolved = getOrThrow(await env.absolutePath(expandUserPath(trimmed), context));
	const exists = getOrThrow(await env.exists(resolved, context));
	if (!exists) throw new Error(`Directory does not exist: ${resolved}`);
	const info = getOrThrow(await env.fileInfo(resolved, context));
	if (info.kind === "directory") return resolved;
	if (info.kind === "symlink") {
		const canonical = getOrThrow(await env.canonicalPath(resolved, context));
		const target = getOrThrow(await env.fileInfo(canonical, context));
		if (target.kind === "directory") return canonical;
	}
	throw new Error(`Not a directory: ${resolved}`);
}
