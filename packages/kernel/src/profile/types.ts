import type { AgentHarnessTool, ExecutionToolContext } from "@earendil-works/pi-agent-core";
import type { Skill } from "../skills/index.ts";
import type { PermissionMode } from "../tools/policy.ts";

export type AgentProfileId = "coding";

/** Prompt + tools + permission default. Drive and session stay shared. */
export interface AgentProfile {
	id: AgentProfileId;
	title: string;
	permissionDefault: PermissionMode;
	tools: () => AgentHarnessTool<ExecutionToolContext>[];
	systemPrompt: (cwd: string, skills?: readonly Skill[]) => string;
}
