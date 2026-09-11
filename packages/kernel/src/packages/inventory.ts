import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import { agentPaths, resolveAgentDir } from "../models/paths.ts";
import { parseFrontmatter } from "../skills/frontmatter.ts";
import {
	agentsSkillsDir,
	collectExtensionFiles,
	collectPackageExtensionFiles,
	collectPackageSkillFiles,
	collectSkillFiles,
	listInstalledPackageDirs,
	npmNameFromSource,
	parentDirName,
	pathEntries,
	posixRelative,
	resolveConfiguredPath,
	uniqueExisting,
} from "./discover.ts";
import { loadPackageSettings, packageSourceString, type PackageSettings, type PackageSource } from "./settings.ts";

export type ResourceKind = "skills" | "extensions";
export type ResourceOrigin = "user" | "agents" | "package" | "settings";

export interface InstalledResource {
	kind: ResourceKind;
	id: string;
	name: string;
	description?: string;
	path: string;
	enabled: boolean;
	source: string;
	origin: ResourceOrigin;
	packageSource?: string;
	pattern: string;
	baseDir: string;
	managed?: boolean;
	disableModelInvocation?: boolean;
}

export interface InstalledResources {
	skills: InstalledResource[];
	extensions: InstalledResource[];
}

interface DiscoveredFile {
	kind: ResourceKind;
	path: string;
	origin: ResourceOrigin;
	baseDir: string;
	source: string;
	packageSource?: string;
	packageConfig?: PackageSource;
}

export async function listInstalledResources(options: { cwd: string; agentDir?: string }): Promise<InstalledResources> {
	const agentDir = resolveAgentDir(options.agentDir);
	const settings = await loadPackageSettings(agentPaths(agentDir).settings);
	const files = discoverFiles(options.cwd, agentDir, settings);
	const skills: InstalledResource[] = [];
	const extensions: InstalledResource[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		if (seen.has(file.path)) continue;
		seen.add(file.path);
		const item = toResource(file, settings);
		if (!item) continue;
		if (item.kind === "skills") skills.push(item);
		else extensions.push(item);
	}
	skills.sort((left, right) => left.name.localeCompare(right.name));
	extensions.sort((left, right) => left.name.localeCompare(right.name));
	return { skills, extensions };
}

export function resourceEnabled(file: DiscoveredFile, settings: PackageSettings): boolean {
	const topLevel = file.kind === "skills" ? settings.skills : settings.extensions;
	if (file.origin === "package") {
		if (file.packageConfig && !packageResourceEnabled(file)) return false;
		return isEnabledByPatterns(file.path, topLevel, file.baseDir);
	}
	return isEnabledByPatterns(file.path, topLevel, file.baseDir);
}

function discoverFiles(cwd: string, agentDir: string, settings: PackageSettings): DiscoveredFile[] {
	const files: DiscoveredFile[] = [];
	for (const path of collectSkillFiles(join(agentDir, "skills"), "pi")) {
		files.push({
			kind: "skills",
			path,
			origin: "user",
			baseDir: agentDir,
			source: displayHome(join(agentDir, "skills")),
		});
	}
	for (const path of collectSkillFiles(agentsSkillsDir(), "agents")) {
		files.push({
			kind: "skills",
			path,
			origin: "agents",
			baseDir: dirname(agentsSkillsDir()),
			source: displayHome(agentsSkillsDir()),
		});
	}
	for (const raw of pathEntries(settings.skills)) {
		const resolved = resolveConfiguredPath(raw, cwd);
		if (!existsSync(resolved)) continue;
		try {
			const stats = statSync(resolved);
			const found = stats.isDirectory()
				? collectSkillFiles(resolved, "pi")
				: stats.isFile() && resolved.endsWith(".md")
					? [resolved]
					: [];
			for (const path of found) {
				files.push({
					kind: "skills",
					path,
					origin: "settings",
					baseDir: stats.isDirectory() ? resolved : dirname(resolved),
					source: raw,
				});
			}
		} catch {
			// ignore unreadable configured paths
		}
	}

	for (const path of collectExtensionFiles(join(agentDir, "extensions"))) {
		files.push({
			kind: "extensions",
			path,
			origin: "user",
			baseDir: agentDir,
			source: displayHome(join(agentDir, "extensions")),
		});
	}
	for (const raw of pathEntries(settings.extensions)) {
		const resolved = resolveConfiguredPath(raw, cwd);
		if (!existsSync(resolved)) continue;
		try {
			const stats = statSync(resolved);
			const found = stats.isFile() ? [resolved] : stats.isDirectory() ? collectExtensionFiles(resolved) : [];
			for (const path of found) {
				files.push({
					kind: "extensions",
					path,
					origin: "settings",
					baseDir: stats.isDirectory() ? resolved : dirname(resolved),
					source: raw,
				});
			}
		} catch {
			// ignore unreadable configured paths
		}
	}

	const packagesByDir = matchInstalledPackages(agentDir, settings);
	for (const packageDir of listInstalledPackageDirs(agentDir)) {
		const matched = packagesByDir.get(packageDir);
		const source = matched?.source ?? packageLabel(packageDir, agentDir);
		const packageConfig = matched?.config;
		for (const path of collectPackageSkillFiles(packageDir)) {
			files.push({
				kind: "skills",
				path,
				origin: "package",
				baseDir: packageDir,
				source,
				packageSource: source,
				packageConfig,
			});
		}
		for (const path of collectPackageExtensionFiles(packageDir)) {
			files.push({
				kind: "extensions",
				path,
				origin: "package",
				baseDir: packageDir,
				source,
				packageSource: source,
				packageConfig,
			});
		}
	}
	return files.filter((file) => uniqueExisting([file.path]).length > 0);
}

function toResource(file: DiscoveredFile, settings: PackageSettings): InstalledResource | undefined {
	const pattern = posixRelative(file.baseDir, file.path);
	const enabled = resourceEnabled(file, settings);
	if (file.kind === "skills") {
		const loaded = readSkillMeta(file.path);
		if (!loaded) return undefined;
		return {
			kind: "skills",
			id: file.path,
			name: loaded.name,
			description: loaded.description,
			path: file.path,
			enabled,
			source: file.source,
			origin: file.origin,
			packageSource: file.packageSource,
			pattern,
			baseDir: file.baseDir,
			managed: Boolean(file.packageConfig),
			disableModelInvocation: loaded.disableModelInvocation,
		};
	}
	return {
		kind: "extensions",
		id: file.path,
		name: extensionDisplayName(file.path),
		path: file.path,
		enabled,
		source: file.source,
		origin: file.origin,
		packageSource: file.packageSource,
		pattern,
		baseDir: file.baseDir,
		managed: Boolean(file.packageConfig),
	};
}

function packageResourceEnabled(file: DiscoveredFile): boolean {
	const pkg = file.packageConfig;
	if (!pkg || typeof pkg === "string") return true;
	const patterns = (file.kind === "skills" ? pkg.skills : pkg.extensions) ?? [];
	if (pkg.autoload === false) {
		return hasForceInclude(file.path, patterns, file.baseDir);
	}
	return isEnabledByPatterns(file.path, patterns, file.baseDir);
}

export function isEnabledByPatterns(filePath: string, patterns: readonly string[], baseDir: string): boolean {
	const candidates = patternCandidates(filePath, baseDir);
	const excludes = patterns.filter((entry) => entry.startsWith("!")).map((entry) => entry.slice(1));
	const forceIncludes = patterns.filter((entry) => entry.startsWith("+")).map((entry) => entry.slice(1));
	const forceExcludes = patterns.filter((entry) => entry.startsWith("-")).map((entry) => entry.slice(1));
	let enabled = true;
	if (excludes.some((pattern) => matchesPattern(pattern, candidates))) enabled = false;
	if (forceIncludes.some((pattern) => matchesPattern(pattern, candidates))) enabled = true;
	if (forceExcludes.some((pattern) => matchesPattern(pattern, candidates))) enabled = false;
	return enabled;
}

function hasForceInclude(filePath: string, patterns: readonly string[], baseDir: string): boolean {
	const candidates = patternCandidates(filePath, baseDir);
	return patterns.some((entry) => entry.startsWith("+") && matchesPattern(entry.slice(1), candidates));
}

function patternCandidates(filePath: string, baseDir: string): Set<string> {
	const rel = posixRelative(baseDir, filePath);
	const names = new Set([rel, filePath, filePath.split("\\").join("/")]);
	if (basename(filePath) === "SKILL.md") {
		names.add(posixRelative(baseDir, dirname(filePath)));
		names.add(dirname(filePath));
	}
	return names;
}

function matchesPattern(pattern: string, candidates: Set<string>): boolean {
	const normalized = pattern.replace(/^\.\//, "").split("\\").join("/");
	return candidates.has(normalized) || [...candidates].some((candidate) => candidate === normalized);
}

function readSkillMeta(filePath: string): { name: string; description: string; disableModelInvocation: boolean } | undefined {
	try {
		const { frontmatter } = parseFrontmatter(readFileSync(filePath, "utf8"));
		const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
		if (!description) return undefined;
		const name =
			typeof frontmatter.name === "string" && frontmatter.name.trim()
				? frontmatter.name.trim()
				: parentDirName(filePath);
		return {
			name,
			description,
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		};
	} catch {
		return undefined;
	}
}

function matchInstalledPackages(
	agentDir: string,
	settings: PackageSettings,
): Map<string, { source: string; config: PackageSource }> {
	const result = new Map<string, { source: string; config: PackageSource }>();
	const npmRoot = join(agentDir, "npm", "node_modules");
	for (const pkg of settings.packages) {
		const source = packageSourceString(pkg);
		const npmName = npmNameFromSource(source);
		if (npmName) {
			const dir = join(npmRoot, npmName);
			if (existsSync(dir)) result.set(dir, { source, config: pkg });
		}
	}
	return result;
}

function packageLabel(packageDir: string, agentDir: string): string {
	const gitRoot = join(agentDir, "git");
	if (packageDir === gitRoot || packageDir.startsWith(`${gitRoot}/`) || packageDir.startsWith(`${gitRoot}\\`)) {
		const rel = posixRelative(gitRoot, packageDir);
		return rel ? `git:${rel}` : "git";
	}
	try {
		const parsed: unknown = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
		if (parsed && typeof parsed === "object" && typeof (parsed as { name?: unknown }).name === "string") {
			return `npm:${(parsed as { name: string }).name}`;
		}
	} catch {
		// fall through
	}
	return basename(packageDir);
}

function extensionDisplayName(path: string): string {
	const base = basename(path);
	if (base === "index.ts" || base === "index.js") return parentDirName(path) || base;
	return base.replace(/\.(ts|js)$/, "");
}

function displayHome(path: string): string {
	const home = homedir();
	if (path === home) return "~";
	if (path.startsWith(`${home}/`) || path.startsWith(`${home}\\`)) return `~${path.slice(home.length).split("\\").join("/")}`;
	return path;
}
