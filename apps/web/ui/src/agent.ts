export type AgentKind = "coding" | "analyse";

const AGENT_KEY = "piruse.agent.kind";

export function readAgentKind(): AgentKind {
	try {
		return localStorage.getItem(AGENT_KEY) === "analyse" ? "analyse" : "coding";
	} catch {
		return "coding";
	}
}

export function writeAgentKind(kind: AgentKind): void {
	try {
		localStorage.setItem(AGENT_KEY, kind);
	} catch {
		return;
	}
}
