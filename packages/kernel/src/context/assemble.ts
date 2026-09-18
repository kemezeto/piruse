import { systemPromptForCwd, type PromptRuntime } from "../prompt/system.ts";
import { formatSkillsForPrompt, type Skill } from "../skills/index.ts";

export type { PromptRuntime };

/** System prompt for this turn. Skills inject here; memory can follow. */
export function assembleSystemPrompt(cwd: string, skills: readonly Skill[] = [], runtime?: PromptRuntime): string {
	return `${systemPromptForCwd(cwd, runtime)}${formatSkillsForPrompt([...skills])}`;
}
