import { systemPromptForCwd } from "../prompt/system.ts";

/** System prompt for this turn. Memory and skills inject here later. */
export function assembleSystemPrompt(cwd: string): string {
	return systemPromptForCwd(cwd);
}
