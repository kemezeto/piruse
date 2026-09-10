import { assembleSystemPrompt } from "../context/assemble.ts";
import { builtinTools } from "../tools/builtin/index.ts";
import type { AgentProfile } from "./types.ts";

export const codingProfile: AgentProfile = {
	id: "coding",
	title: "Coding",
	permissionDefault: "review",
	tools: builtinTools,
	systemPrompt: assembleSystemPrompt,
};
