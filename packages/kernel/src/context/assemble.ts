import { systemPromptForCwd } from "../prompt/system.ts";
import { formatSkillsForPrompt, type Skill } from "../skills/index.ts";

/** System prompt for this turn. Skills inject here; memory can follow. */
export function assembleSystemPrompt(cwd: string, skills: readonly Skill[] = []): string {
	return `${systemPromptForCwd(cwd)}${formatSkillsForPrompt([...skills])}`;
}
