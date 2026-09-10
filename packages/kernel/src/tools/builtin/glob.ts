import { relative } from "node:path";
import {
	type AgentHarnessTool,
	type ExecutionToolContext,
	getOrThrow,
} from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { toolText } from "./result.ts";
import { runCommand } from "./run.ts";
import { walkFiles } from "./walk.ts";

const DEFAULT_LIMIT = 1000;

const globSchema = Type.Object({
	pattern: Type.String({ description: "Glob pattern, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'" }),
	path: Type.Optional(Type.String({ description: "Directory to search (default: working directory)" })),
	limit: Type.Optional(Type.Number({ description: `Maximum paths to return (default ${DEFAULT_LIMIT})` })),
});

function displayPath(cwd: string, filePath: string): string {
	const relativePath = relative(cwd, filePath);
	if (!relativePath || relativePath.startsWith("..")) return filePath.replaceAll("\\", "/");
	return relativePath.replaceAll("\\", "/");
}

function matchesGlob(relativePath: string, pattern: string): boolean {
	const posix = relativePath.replaceAll("\\", "/");
	const full = pattern.includes("/") || pattern.startsWith("**/") ? pattern : `**/${pattern}`;
	const token = full
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replaceAll("**", "{{GS}}")
		.replaceAll("*", "[^/]*")
		.replaceAll("?", "[^/]")
		.replaceAll("{{GS}}", ".*");
	return new RegExp(`^${token}$`).test(posix);
}

export function globTool() {
	return {
		name: "glob",
		label: "glob",
		description: `Find files by glob pattern. Prefers ripgrep when installed (respects .gitignore). Returns up to ${DEFAULT_LIMIT} paths.`,
		parameters: globSchema,
		async execute(_toolCallId, params, _onUpdate, { env }, _invocation, context) {
			const root = getOrThrow(await env.absolutePath(params.path?.trim() || ".", context));
			const exists = getOrThrow(await env.exists(root, context));
			if (!exists) {
				return toolText(`Path not found: ${root}`, true);
			}
			const info = getOrThrow(await env.fileInfo(root, context));
			if (info.kind !== "directory") {
				return toolText(`Not a directory: ${root}`, true);
			}
			const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, 5000));
			const fromRg = await globWithRipgrep(env.cwd, info.path, params.pattern, limit, context.abortSignal);
			if (fromRg !== undefined) return fromRg;
			const files = await walkFiles(env, info.path, context);
			const hits: string[] = [];
			for (const filePath of files) {
				const relativePath = relative(info.path, filePath) || filePath;
				if (!matchesGlob(relativePath, params.pattern)) continue;
				hits.push(displayPath(env.cwd, filePath));
				if (hits.length >= limit) break;
			}
			if (hits.length === 0) return toolText("No files matched.");
			const extra = hits.length >= limit ? `\n… stopped at ${limit} paths` : "";
			return toolText(`${hits.join("\n")}${extra}`);
		},
	} satisfies AgentHarnessTool<ExecutionToolContext, typeof globSchema>;
}

async function globWithRipgrep(
	cwd: string,
	searchPath: string,
	pattern: string,
	limit: number,
	signal: AbortSignal | undefined,
): Promise<ReturnType<typeof toolText> | undefined> {
	const result = await runCommand("rg", ["--files", "--hidden", "--glob", pattern, "--", searchPath], {
		cwd,
		signal,
	});
	if (result.missing) return undefined;
	if (result.code !== 0 && result.code !== 1) {
		const detail = result.stderr.trim() || `ripgrep exited ${result.code}`;
		return toolText(detail);
	}
	const hits = result.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.slice(0, limit)
		.map((filePath) => displayPath(cwd, filePath));
	if (hits.length === 0) return toolText("No files matched.");
	const extra = hits.length >= limit ? `\n… stopped at ${limit} paths` : "";
	return toolText(`${hits.join("\n")}${extra}`);
}
