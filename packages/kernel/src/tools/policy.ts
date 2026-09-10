export type PermissionMode = "read" | "review" | "allow";
export type ApprovalReason = "mutate" | "execute" | "dangerous";
export type ToolClass = "observe" | "mutate" | "execute";

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

export function isPermissionMode(value: unknown): value is PermissionMode {
	return value === "read" || value === "review" || value === "allow";
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

/** Why this call must be blocked or confirmed. `null` means run it. */
export function approvalReason(
	mode: PermissionMode,
	toolName: string,
	args: Record<string, unknown>,
): ApprovalReason | null {
	const kind = toolClass(toolName);
	if (kind === "observe") return null;
	const dangerous = toolName === "bash" && isDangerousBash(commandText(args));
	if (mode === "read") return kind === "mutate" ? "mutate" : dangerous ? "dangerous" : "execute";
	if (mode === "review") {
		if (dangerous) return "dangerous";
		return kind === "mutate" ? "mutate" : "execute";
	}
	return dangerous ? "dangerous" : null;
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
