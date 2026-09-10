export function systemPromptForCwd(cwd: string): string {
	return [
		"You are a coding agent.",
		`Working directory: ${cwd}`,
		"Use the read, grep, glob, write, edit, and bash tools to inspect and change files.",
		"Keep answers short and technical.",
	].join("\n");
}
