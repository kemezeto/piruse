import { codingProfile } from "./coding.ts";
import type { AgentProfile, AgentProfileId } from "./types.ts";

export type { AgentProfile, AgentProfileId } from "./types.ts";

const profiles: Record<AgentProfileId, AgentProfile> = {
	coding: codingProfile,
};

export function resolveProfile(id: string | undefined = "coding"): AgentProfile {
	const profile = profiles[id as AgentProfileId];
	if (!profile) throw new Error(`Unknown profile: ${id}`);
	return profile;
}
