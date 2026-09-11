import { agentPaths, resolveAgentDir } from "../models/paths.ts";
import { listInstalledResources, type ResourceKind } from "./inventory.ts";
import {
	packageSourceString,
	patchSettingsJson,
	type PackageSource,
} from "./settings.ts";

export async function setResourceEnabled(options: {
	cwd: string;
	agentDir?: string;
	kind: ResourceKind;
	id: string;
	enabled: boolean;
}): Promise<void> {
	const agentDir = resolveAgentDir(options.agentDir);
	const listed = await listInstalledResources({ cwd: options.cwd, agentDir });
	const item = [...listed.skills, ...listed.extensions].find(
		(resource) => resource.kind === options.kind && resource.id === options.id,
	);
	if (!item) throw new Error("Unknown package resource");
	const settingsPath = agentPaths(agentDir).settings;
	await patchSettingsJson(settingsPath, (file) => {
		if (item.origin === "package" && item.managed && item.packageSource) {
			file.packages = upsertPackageOverride(
				Array.isArray(file.packages) ? file.packages : [],
				item.packageSource,
				item.kind,
				item.pattern,
				options.enabled,
			);
			return;
		}
		const key = item.kind;
		const current = Array.isArray(file[key]) ? file[key] : [];
		const pattern = item.origin === "package" ? item.path : item.pattern;
		file[key] = upsertPattern(
			current.filter((entry): entry is string => typeof entry === "string"),
			pattern,
			options.enabled,
		);
	});
}

function upsertPattern(entries: string[], pattern: string, enabled: boolean): string[] {
	const next = entries.filter((entry) => patternTarget(entry) !== pattern);
	next.push(`${enabled ? "+" : "-"}${pattern}`);
	return next;
}

function patternTarget(entry: string): string {
	return entry.startsWith("!") || entry.startsWith("+") || entry.startsWith("-") ? entry.slice(1) : entry;
}

function upsertPackageOverride(
	packages: unknown[],
	source: string,
	kind: ResourceKind,
	pattern: string,
	enabled: boolean,
): PackageSource[] {
	const next = packages.map(asWritablePackage).filter((entry): entry is PackageSource => entry !== undefined);
	let index = next.findIndex((pkg) => packageSourceString(pkg) === source);
	if (index === -1) {
		next.push({ source });
		index = next.length - 1;
	}
	let pkg = next[index];
	if (typeof pkg === "string") {
		pkg = { source: pkg };
		next[index] = pkg;
	}
	const current = pkg[kind] ?? [];
	pkg[kind] = upsertPattern(current, pattern, enabled);
	if ((pkg.skills?.length ?? 0) === 0 && (pkg.extensions?.length ?? 0) === 0 && pkg.autoload !== false) {
		next[index] = pkg.source;
	}
	return next;
}

function asWritablePackage(value: unknown): PackageSource | undefined {
	if (typeof value === "string" && value.trim()) return value.trim();
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.source !== "string" || !record.source.trim()) return undefined;
	return {
		source: record.source.trim(),
		autoload: typeof record.autoload === "boolean" ? record.autoload : undefined,
		extensions: stringList(record.extensions),
		skills: stringList(record.skills),
		prompts: stringList(record.prompts),
		themes: stringList(record.themes),
	};
}

function stringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const entries = value.filter((entry): entry is string => typeof entry === "string");
	return entries;
}
