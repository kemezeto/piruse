import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { expandUserPath } from "../session/projects.ts";
import { readPiManifest } from "./manifest.ts";

export function resolveConfiguredPath(raw: string, cwd: string): string {
	const expanded = expandUserPath(raw.trim());
	if (expanded.startsWith("/")) return resolve(expanded);
	return resolve(cwd, expanded);
}

export function listInstalledPackageDirs(agentDir: string): string[] {
	const dirs: string[] = [];
	dirs.push(...listNpmPackageDirs(join(agentDir, "npm", "node_modules")));
	dirs.push(...listGitPackageDirs(join(agentDir, "git")));
	return uniqueExisting(dirs);
}

function listNpmPackageDirs(nodeModules: string): string[] {
	if (!existsSync(nodeModules)) return [];
	const dirs: string[] = [];
	for (const entry of readDirSafe(nodeModules)) {
		if (entry.startsWith(".") || entry === ".bin") continue;
		const full = join(nodeModules, entry);
		if (!isDirectory(full)) continue;
		if (entry.startsWith("@")) {
			for (const scoped of readDirSafe(full)) {
				const nested = join(full, scoped);
				if (isDirectory(nested)) dirs.push(nested);
			}
			continue;
		}
		dirs.push(full);
	}
	return dirs;
}

function listGitPackageDirs(root: string): string[] {
	if (!existsSync(root)) return [];
	const dirs: string[] = [];
	walk(root, 0, 6, (dir) => {
		if (existsSync(join(dir, "package.json")) || existsSync(join(dir, "skills")) || existsSync(join(dir, "extensions"))) {
			dirs.push(dir);
			return "skip";
		}
		return "continue";
	});
	return dirs;
}

function walk(dir: string, depth: number, maxDepth: number, visit: (dir: string) => "skip" | "continue"): void {
	if (depth > maxDepth) return;
	const decision = visit(dir);
	if (decision === "skip") return;
	for (const name of readDirSafe(dir)) {
		if (name.startsWith(".") || name === "node_modules") continue;
		const full = join(dir, name);
		if (isDirectory(full)) walk(full, depth + 1, maxDepth, visit);
	}
}

export function collectSkillFiles(dir: string, mode: "pi" | "agents"): string[] {
	const files: string[] = [];
	collectSkillFilesInto(dir, mode, dir, files);
	return files;
}

function collectSkillFilesInto(dir: string, mode: "pi" | "agents", root: string, files: string[]): void {
	if (!existsSync(dir)) return;
	const entries = readDirents(dir);
	const skillMd = entries.find((entry) => entry.name === "SKILL.md");
	if (skillMd?.isFile()) {
		files.push(join(dir, skillMd.name));
		return;
	}

	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const full = join(dir, entry.name);
		if (entry.isFile() && entry.name.endsWith(".md")) {
			const includeRootMd = mode === "pi" ? dir === root : dir !== root;
			if (includeRootMd) files.push(full);
			continue;
		}
		if (entry.isDirectory()) collectSkillFilesInto(full, mode, root, files);
	}
}

export function collectExtensionFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	const rootEntries = resolveExtensionEntries(dir);
	if (rootEntries) return rootEntries;

	const files: string[] = [];
	for (const entry of readDirents(dir)) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const full = join(dir, entry.name);
		if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
			files.push(full);
			continue;
		}
		if (entry.isDirectory()) {
			const nested = resolveExtensionEntries(full);
			if (nested) files.push(...nested);
		}
	}
	return files;
}

export function resolveExtensionEntries(dir: string): string[] | null {
	const manifest = existsSync(join(dir, "package.json")) ? readPiManifest(join(dir, "package.json")) : null;
	if (manifest?.extensions?.length) {
		const entries = manifest.extensions
			.map((entry) => resolve(dir, entry))
			.filter((path) => existsSync(path));
		if (entries.length > 0) return entries;
	}
	const indexTs = join(dir, "index.ts");
	const indexJs = join(dir, "index.js");
	if (existsSync(indexTs)) return [indexTs];
	if (existsSync(indexJs)) return [indexJs];
	return null;
}

export function collectPackageSkillFiles(packageRoot: string): string[] {
	const manifest = readPiManifest(join(packageRoot, "package.json"));
	if (manifest?.skills) {
		return expandResourcePaths(packageRoot, manifest.skills, "skills");
	}
	const skillsDir = join(packageRoot, "skills");
	return existsSync(skillsDir) ? collectSkillFiles(skillsDir, "pi") : [];
}

export function collectPackageExtensionFiles(packageRoot: string): string[] {
	const manifest = readPiManifest(join(packageRoot, "package.json"));
	if (manifest?.extensions) {
		return expandResourcePaths(packageRoot, manifest.extensions, "extensions");
	}
	const extensionsDir = join(packageRoot, "extensions");
	return existsSync(extensionsDir) ? collectExtensionFiles(extensionsDir) : [];
}

function expandResourcePaths(packageRoot: string, entries: string[], kind: "skills" | "extensions"): string[] {
	const files: string[] = [];
	for (const entry of entries) {
		const resolved = resolve(packageRoot, entry);
		if (!existsSync(resolved)) continue;
		const stats = statSync(resolved);
		if (stats.isFile()) {
			files.push(resolved);
			continue;
		}
		if (stats.isDirectory()) {
			files.push(...(kind === "skills" ? collectSkillFiles(resolved, "pi") : collectExtensionFiles(resolved)));
		}
	}
	return files;
}

export function uniqueExisting(paths: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const path of paths) {
		let key = path;
		try {
			key = realpathSync(path);
		} catch {
			if (!existsSync(path)) continue;
		}
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(path);
	}
	return result;
}

export function parentDirName(filePath: string): string {
	return basename(dirname(filePath));
}

export function agentsSkillsDir(): string {
	return join(homedir(), ".agents", "skills");
}

export function posixRelative(from: string, to: string): string {
	return relative(from, to).split(sep).join("/");
}

export function isOverrideEntry(entry: string): boolean {
	return entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-");
}

export function pathEntries(entries: readonly string[]): string[] {
	return entries.filter((entry) => !isOverrideEntry(entry));
}

export function npmNameFromSource(source: string): string | undefined {
	if (!source.startsWith("npm:")) return undefined;
	const rest = source.slice(4);
	if (rest.startsWith("@")) {
		const at = rest.indexOf("@", 1);
		return at === -1 ? rest : rest.slice(0, at);
	}
	const at = rest.indexOf("@");
	return at === -1 ? rest : rest.slice(0, at);
}

function readDirSafe(dir: string): string[] {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}

function readDirents(dir: string): Array<{ name: string; isFile(): boolean; isDirectory(): boolean }> {
	try {
		return readdirSync(dir, { withFileTypes: true }).map((entry) => {
			const full = join(dir, entry.name);
			let isFile = entry.isFile();
			let isDirectory = entry.isDirectory();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(full);
					isFile = stats.isFile();
					isDirectory = stats.isDirectory();
				} catch {
					isFile = false;
					isDirectory = false;
				}
			}
			return { name: entry.name, isFile: () => isFile, isDirectory: () => isDirectory };
		});
	} catch {
		return [];
	}
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
