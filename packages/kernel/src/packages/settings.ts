import { readFile } from "node:fs/promises";

export type PackageSource =
	| string
	| {
			source: string;
			autoload?: boolean;
			extensions?: string[];
			skills?: string[];
			prompts?: string[];
			themes?: string[];
	  };

export interface PackageSettings {
	skills: string[];
	extensions: string[];
	packages: PackageSource[];
}

function stringList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function asPackageSource(value: unknown): PackageSource | undefined {
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

export async function loadPackageSettings(path: string): Promise<PackageSettings> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { skills: [], extensions: [], packages: [] };
		}
		const record = parsed as Record<string, unknown>;
		const packages = Array.isArray(record.packages)
			? record.packages.map(asPackageSource).filter((entry): entry is PackageSource => entry !== undefined)
			: [];
		return {
			skills: stringList(record.skills),
			extensions: stringList(record.extensions),
			packages,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { skills: [], extensions: [], packages: [] };
		}
		throw error;
	}
}
