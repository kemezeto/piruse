import { relative } from "node:path";
import {
	type AgentHarnessTool,
	type Context,
	type ExecutionEnv,
	type ExecutionToolContext,
	getOrThrow,
} from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { toolText } from "./result.ts";
import { runCommand } from "./run.ts";
import { walkFiles } from "./walk.ts";

const DEFAULT_LIMIT = 100;
const MAX_LINE = 400;
const MAX_FILE_BYTES = 1_000_000;

const grepSchema = Type.Object({
	pattern: Type.String({ description: "Search pattern (regex, or literal when literal=true)" }),
	path: Type.Optional(Type.String({ description: "File or directory to search (default: working directory)" })),
	glob: Type.Optional(Type.String({ description: "Only search files matching this glob, e.g. '*.ts'" })),
	ignoreCase: Type.Optional(Type.Boolean({ description: "Case-insensitive search" })),
	literal: Type.Optional(Type.Boolean({ description: "Treat pattern as a literal string, not a regex" })),
	limit: Type.Optional(Type.Number({ description: `Maximum matches to return (default ${DEFAULT_LIMIT})` })),
});

function displayPath(cwd: string, filePath: string): string {
	const relativePath = relative(cwd, filePath);
	if (!relativePath || relativePath.startsWith("..")) return filePath.replaceAll("\\", "/");
	return relativePath.replaceAll("\\", "/");
}

function clipLine(text: string): string {
	const trimmed = text.replace(/\r?\n$/, "");
	if (trimmed.length <= MAX_LINE) return trimmed;
	return `${trimmed.slice(0, MAX_LINE)}…`;
}

function matchesGlob(relativePath: string, pattern: string): boolean {
	const posix = relativePath.replaceAll("\\", "/");
	const full = pattern.includes("/") || pattern.startsWith("**/") ? pattern : `**/${pattern}`;
	const token = full.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "{{GS}}").replaceAll("*", "[^/]*").replaceAll("?", "[^/]").replaceAll("{{GS}}", ".*");
	return new RegExp(`^${token}$`).test(posix);
}

export function grepTool() {
	return {
		name: "grep",
		label: "grep",
		description: `Search file contents for a pattern. Prefers ripgrep when installed (respects .gitignore). Returns up to ${DEFAULT_LIMIT} matching lines.`,
		parameters: grepSchema,
		async execute(_toolCallId, params, _onUpdate, { env }, _invocation, context) {
			const root = getOrThrow(await env.absolutePath(params.path?.trim() || ".", context));
			const exists = getOrThrow(await env.exists(root, context));
			if (!exists) {
				return toolText(`Path not found: ${root}`, true);
			}
			const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, 500));
			const info = await env.fileInfo(root, context);
			const searchPath = info.ok ? info.value.path : root;
			const fromRg = await grepWithRipgrep(env.cwd, searchPath, params, limit, context.abortSignal);
			if (fromRg !== undefined) return fromRg;
			return grepByWalk(env, searchPath, params, limit, context);
		},
	} satisfies AgentHarnessTool<ExecutionToolContext, typeof grepSchema>;
}

async function grepWithRipgrep(
	cwd: string,
	searchPath: string,
	params: {
		pattern: string;
		glob?: string;
		ignoreCase?: boolean;
		literal?: boolean;
	},
	limit: number,
	signal: AbortSignal | undefined,
): Promise<ReturnType<typeof toolText> | undefined> {
	const args = ["--json", "--hidden", "--color=never"];
	if (params.ignoreCase) args.push("--ignore-case");
	if (params.literal) args.push("--fixed-strings");
	if (params.glob) args.push("--glob", params.glob);
	args.push("--", params.pattern, searchPath);
	const result = await runCommand("rg", args, { cwd, signal });
	if (result.missing) return undefined;
	if (result.code !== 0 && result.code !== 1) {
		const detail = result.stderr.trim() || `ripgrep exited ${result.code}`;
		return toolText(detail);
	}
	const lines: string[] = [];
	for (const raw of result.stdout.split("\n")) {
		if (!raw.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			continue;
		}
		if (!parsed || typeof parsed !== "object" || !("type" in parsed) || parsed.type !== "match") continue;
		const data = "data" in parsed && parsed.data && typeof parsed.data === "object" ? parsed.data : undefined;
		if (!data) continue;
		const pathValue = "path" in data && data.path && typeof data.path === "object" && "text" in data.path ? data.path.text : undefined;
		const lineNumber = "line_number" in data && typeof data.line_number === "number" ? data.line_number : undefined;
		const textValue =
			"lines" in data && data.lines && typeof data.lines === "object" && "text" in data.lines ? data.lines.text : undefined;
		if (typeof pathValue !== "string" || lineNumber === undefined || typeof textValue !== "string") continue;
		lines.push(`${displayPath(cwd, pathValue)}:${lineNumber}:${clipLine(textValue)}`);
		if (lines.length >= limit) break;
	}
	if (lines.length === 0) return toolText("No matches.");
	const extra = lines.length >= limit ? `\n… stopped at ${limit} matches` : "";
	return toolText(`${lines.join("\n")}${extra}`);
}

async function grepByWalk(
	env: ExecutionEnv,
	searchPath: string,
	params: {
		pattern: string;
		glob?: string;
		ignoreCase?: boolean;
		literal?: boolean;
	},
	limit: number,
	context: Context,
): Promise<ReturnType<typeof toolText>> {
	const info = getOrThrow(await env.fileInfo(searchPath, context));
	const files = info.kind === "file" ? [info.path] : await walkFiles(env, searchPath, context);
	let regex: RegExp;
	try {
		const source = params.literal ? escapeRegExp(params.pattern) : params.pattern;
		regex = new RegExp(source, params.ignoreCase ? "i" : undefined);
	} catch {
		return toolText(`Invalid regex: ${params.pattern}`);
	}
	const lines: string[] = [];
	for (const filePath of files) {
		if (context.abortSignal?.aborted) break;
		if (lines.length >= limit) break;
		if (params.glob && !matchesGlob(relative(searchPath, filePath) || filePath, params.glob)) continue;
		const meta = await env.fileInfo(filePath, context);
		if (!meta.ok || meta.value.size > MAX_FILE_BYTES) continue;
		const text = await env.readTextFile(filePath, context);
		if (!text.ok || text.value.includes("\0")) continue;
		const fileLines = text.value.split(/\r?\n/);
		for (let index = 0; index < fileLines.length; index++) {
			if (!regex.test(fileLines[index]!)) continue;
			lines.push(`${displayPath(env.cwd, filePath)}:${index + 1}:${clipLine(fileLines[index]!)}`);
			if (lines.length >= limit) break;
		}
	}
	if (lines.length === 0) return toolText("No matches.");
	const extra = lines.length >= limit ? `\n… stopped at ${limit} matches` : "";
	return toolText(`${lines.join("\n")}${extra}`);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
