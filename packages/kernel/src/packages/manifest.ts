import { readFileSync } from "node:fs";

export interface PiManifest {
	extensions?: string[];
	skills?: string[];
	prompts?: string[];
	themes?: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return undefined;
	return value;
}

export function readPiManifest(packageJsonPath: string): PiManifest | null {
	try {
		const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8").replace(/^\uFEFF/, ""));
		if (!isObject(parsed) || !isObject(parsed.pi)) return null;
		const manifest: PiManifest = {};
		const extensions = stringList(parsed.pi.extensions);
		const skills = stringList(parsed.pi.skills);
		const prompts = stringList(parsed.pi.prompts);
		const themes = stringList(parsed.pi.themes);
		if (extensions) manifest.extensions = extensions;
		if (skills) manifest.skills = skills;
		if (prompts) manifest.prompts = prompts;
		if (themes) manifest.themes = themes;
		return Object.keys(manifest).length > 0 ? manifest : { ...manifest };
	} catch {
		return null;
	}
}
