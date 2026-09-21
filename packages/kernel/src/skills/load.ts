import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveAgentDir } from "../models/paths.ts";
import {
	agentsSkillsDir,
	collectPackageSkillFiles,
	collectSkillFiles,
	listInstalledPackageDirs,
	parentDirName,
	pathEntries,
	resolveConfiguredPath,
	uniqueExisting,
} from "../packages/discover.ts";
import { listInstalledResources } from "../packages/inventory.ts";
import { parseFrontmatter } from "./frontmatter.ts";

export interface Skill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	disableModelInvocation: boolean;
}

export interface SkillDiagnostic {
	level: "error" | "warning";
	message: string;
	path?: string;
}

export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: SkillDiagnostic[];
}

export interface LoadSkillsOptions {
	cwd: string;
	agentDir?: string;
	skillPaths?: string[];
}

export function formatSkillsForPrompt(skills: Skill[], fileReadTool: "read" | "bash" = "read"): string {
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";

	const lines = [
		"",
		"",
		"The following skills provide specialized instructions for specific tasks.",
		fileReadTool === "read"
			? "Use the read tool to load a skill's file when the task matches its description."
			: "Use bash to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];
	for (const skill of visible) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(skill.name)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}
	lines.push("</available_skills>");
	return lines.join("\n");
}

export function skillsFromResources(
	resources: Array<{
		name: string;
		description?: string;
		path: string;
		baseDir: string;
		enabled: boolean;
		disableModelInvocation?: boolean;
	}>,
): Skill[] {
	return resources
		.filter((skill) => skill.enabled)
		.map((skill) => ({
			name: skill.name,
			description: skill.description ?? "",
			filePath: skill.path,
			baseDir: skill.baseDir,
			disableModelInvocation: skill.disableModelInvocation === true,
		}));
}

export async function loadUserSkills(options: LoadSkillsOptions): Promise<LoadSkillsResult> {
	const listed = await listInstalledResources({ cwd: options.cwd, agentDir: options.agentDir });
	const skills = skillsFromResources(listed.skills);
	if (!options.skillPaths?.length) return { skills, diagnostics: [] };
	const extra = loadSkillsSync({
		cwd: options.cwd,
		agentDir: resolveAgentDir(options.agentDir),
		skillPaths: pathEntries(options.skillPaths),
		includeDefaults: false,
	});
	return {
		skills: [...skills, ...extra.skills.filter((skill) => !skills.some((current) => current.name === skill.name))],
		diagnostics: extra.diagnostics,
	};
}

export function loadSkillsSync(options: {
	cwd: string;
	agentDir: string;
	skillPaths: string[];
	includeDefaults?: boolean;
}): LoadSkillsResult {
	const files: string[] = [];
	if (options.includeDefaults !== false) {
		files.push(...collectSkillFiles(join(options.agentDir, "skills"), "pi"));
		files.push(...collectSkillFiles(agentsSkillsDir(), "agents"));
		for (const packageDir of listInstalledPackageDirs(options.agentDir)) {
			files.push(...collectPackageSkillFiles(packageDir));
		}
	}
	for (const raw of options.skillPaths) {
		const resolved = resolveConfiguredPath(raw, options.cwd);
		if (!existsSync(resolved)) continue;
		try {
			const stats = statSync(resolved);
			if (stats.isDirectory()) files.push(...collectSkillFiles(resolved, "pi"));
			else if (stats.isFile() && resolved.endsWith(".md")) files.push(resolved);
		} catch {
			// ignore unreadable configured paths
		}
	}

	const skills: Skill[] = [];
	const diagnostics: SkillDiagnostic[] = [];
	const names = new Set<string>();
	for (const filePath of uniqueExisting(files)) {
		const loaded = loadSkillFromFile(filePath);
		diagnostics.push(...loaded.diagnostics);
		if (!loaded.skill) continue;
		if (names.has(loaded.skill.name)) {
			diagnostics.push({
				level: "warning",
				message: `skill name "${loaded.skill.name}" already loaded`,
				path: filePath,
			});
			continue;
		}
		names.add(loaded.skill.name);
		skills.push(loaded.skill);
	}
	return { skills, diagnostics };
}

export function skillFromFile(filePath: string): Skill | null {
	return loadSkillFromFile(filePath).skill;
}

function loadSkillFromFile(filePath: string): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
	const diagnostics: SkillDiagnostic[] = [];
	let content: string;
	try {
		content = readFileSync(filePath, "utf8");
	} catch (error) {
		return {
			skill: null,
			diagnostics: [{ level: "warning", message: error instanceof Error ? error.message : "failed to read skill", path: filePath }],
		};
	}
	const { frontmatter } = parseFrontmatter(content);
	const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
	if (!description) {
		return { skill: null, diagnostics };
	}
	const name =
		typeof frontmatter.name === "string" && frontmatter.name.trim() ? frontmatter.name.trim() : parentDirName(filePath);
	if (name.length > 64) {
		diagnostics.push({ level: "warning", message: "skill name exceeds 64 characters", path: filePath });
	}
	if (description.length > 1024) {
		diagnostics.push({ level: "warning", message: "skill description exceeds 1024 characters", path: filePath });
	}
	return {
		skill: {
			name,
			description,
			filePath,
			baseDir: dirname(filePath),
			disableModelInvocation: frontmatter["disable-model-invocation"] === true,
		},
		diagnostics,
	};
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
