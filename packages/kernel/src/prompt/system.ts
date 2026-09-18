export interface PromptRuntime {
	provider: string;
	modelId: string;
	thinkingLevel: string;
}

export function systemPromptForCwd(cwd: string, runtime?: PromptRuntime): string {
	const lines = ["You are a coding agent.", `Working directory: ${cwd}`];
	if (runtime) {
		lines.push(`Current model: ${runtime.provider}/${runtime.modelId}`);
		lines.push(`Thinking level: ${runtime.thinkingLevel}`);
	}
	lines.push("Use the read, grep, glob, write, edit, and bash tools to inspect and change files.");
	lines.push(
		"Never read credential files (auth.json, master.key, .env, ~/.pi, ~/.piruse) or infer model/thinking from them. Use Current model and Thinking level above.",
	);
	lines.push("Keep answers short and technical.");
	return lines.join("\n");
}
