import {
	commandPrefix,
	displayPath,
	mutatePath,
	pathScope,
	prefixMatches,
	redirectTargets,
	resolveToolPath,
	type PathScope,
} from "./scope.ts";

export type PermissionMode = "read" | "review" | "allow";
export type ApprovalReason = "mutate" | "execute" | "dangerous" | "outside" | "protected";
export type ApprovalRemember = "session" | "prefix" | "path";
export type ToolClass = "observe" | "mutate" | "execute";

export { commandPrefix, displayPath, pathScope, prefixMatches, resolveToolPath };
export type { PathScope };

const OBSERVE = new Set(["read", "grep", "glob", "ls", "find"]);
const MUTATE = new Set(["write", "edit"]);

const DANGEROUS_BASH = [
	/\brm\b/,
	/\brmdir\b/,
	/\bunlink\b/,
	/\bshred\b/,
	/\bfind\b[\s\S]*\s-delete\b/,
	/\bgit\s+rm\b/,
	/\bgit\s+reset\b[\s\S]*--hard\b/,
	/\bgit\s+clean\b/,
	/\bgit\s+checkout\s+--\b/,
	/\bgit\s+restore\b/,
	/\bgit\s+push\b[\s\S]*(--force\b|--force-with-lease\b|\s-f\b)/,
	/\bgit\s+push\s+-f\b/,
];

export interface CallVerdict {
	reason: ApprovalReason | null;
	path?: string;
	displayPath?: string;
	command?: string;
	prefix?: string;
	remember: ApprovalRemember[];
}

export interface SessionGrants {
	classes: Set<"mutate" | "execute">;
	paths: Set<string>;
	prefixes: string[];
}

export function isPermissionMode(value: unknown): value is PermissionMode {
	return value === "read" || value === "review" || value === "allow";
}

export function isApprovalRemember(value: unknown): value is ApprovalRemember {
	return value === "session" || value === "prefix" || value === "path";
}

export function toolClass(name: string): ToolClass {
	if (OBSERVE.has(name)) return "observe";
	if (MUTATE.has(name)) return "mutate";
	return "execute";
}

export function commandText(args: Record<string, unknown>): string {
	const command = args.command;
	return typeof command === "string" ? command : "";
}

export function isDangerousBash(command: string): boolean {
	return DANGEROUS_BASH.some((pattern) => pattern.test(command));
}

export function emptyGrants(prefixes: readonly string[] = []): SessionGrants {
	return { classes: new Set(), paths: new Set(), prefixes: [...prefixes] };
}

export function inspectToolCall(
	mode: PermissionMode,
	toolName: string,
	args: Record<string, unknown>,
	cwd: string,
): CallVerdict {
	const kind = toolClass(toolName);
	const command = toolName === "bash" ? commandText(args) : undefined;
	const rawPath = kind === "mutate" ? mutatePath(args) : undefined;
	const resolved = rawPath ? resolveToolPath(cwd, rawPath) : undefined;
	const redirectScopes = (command ? redirectTargets(command) : []).map((target) => {
		const abs = resolveToolPath(cwd, target);
		return { abs, scope: pathScope(cwd, abs) };
	});
	const fileScope = resolved ? pathScope(cwd, resolved) : undefined;
	const worst =
		fileScope === "protected" || redirectScopes.some((entry) => entry.scope === "protected")
			? "protected"
			: fileScope === "outside" || redirectScopes.some((entry) => entry.scope === "outside")
				? "outside"
				: fileScope;
	const scoped = worst === "protected" || worst === "outside" ? (resolved ?? redirectScopes.find((entry) => entry.scope === worst)?.abs) : resolved;
	const prefix = command ? commandPrefix(command) : undefined;
	const dangerous = Boolean(command && isDangerousBash(command));

	if (kind === "observe") return { reason: null, remember: [] };
	if (dangerous) return { reason: "dangerous", command, remember: [] };
	if (worst === "protected") {
		return {
			reason: "protected",
			path: scoped,
			displayPath: scoped ? displayPath(cwd, scoped) : undefined,
			command,
			remember: [],
		};
	}
	if (worst === "outside") {
		return {
			reason: "outside",
			path: scoped,
			displayPath: scoped ? displayPath(cwd, scoped) : undefined,
			command,
			remember: scoped ? ["path"] : [],
		};
	}
	if (mode === "allow") return { reason: null, path: resolved, displayPath: resolved ? displayPath(cwd, resolved) : undefined, command, prefix, remember: [] };
	if (kind === "mutate") {
		return {
			reason: "mutate",
			path: resolved,
			displayPath: resolved ? displayPath(cwd, resolved) : undefined,
			remember: ["session"],
		};
	}
	return {
		reason: "execute",
		command,
		prefix,
		remember: prefix ? ["session", "prefix"] : ["session"],
	};
}

export function grantsAllow(verdict: CallVerdict, grants: SessionGrants): boolean {
	if (!verdict.reason) return true;
	if (verdict.reason === "dangerous" || verdict.reason === "protected") return false;
	if (verdict.reason === "outside") return Boolean(verdict.path && grants.paths.has(verdict.path));
	if (verdict.reason === "mutate") return grants.classes.has("mutate");
	if (verdict.reason === "execute") {
		if (grants.classes.has("execute")) return true;
		return Boolean(verdict.command && prefixMatches(verdict.command, grants.prefixes));
	}
	return false;
}

/** Why this call must be blocked or confirmed. `null` means run it without a prompt. */
export function approvalReason(
	mode: PermissionMode,
	toolName: string,
	args: Record<string, unknown>,
	cwd = process.cwd(),
): ApprovalReason | null {
	return inspectToolCall(mode, toolName, args, cwd).reason;
}

export function activeToolNamesForMode(mode: PermissionMode, available: readonly string[]): string[] {
	if (mode !== "read") return [...available];
	return available.filter((name) => toolClass(name) === "observe");
}

export function permissionLabel(mode: PermissionMode): string {
	if (mode === "read") return "只读";
	if (mode === "review") return "审核";
	return "允许";
}

export function reasonLabel(reason: ApprovalReason): string {
	if (reason === "mutate") return "改文件";
	if (reason === "dangerous") return "危险命令";
	if (reason === "outside") return "工作区外";
	if (reason === "protected") return "受保护路径";
	return "跑命令";
}
