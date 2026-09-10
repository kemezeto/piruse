import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface AgentPaths {
	dir: string;
	auth: string;
	settings: string;
	models: string;
}

function expandUserPath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

/** Same directory pi uses: `~/.pi/agent`, or `PI_CODING_AGENT_DIR`. */
export function resolveAgentDir(explicit?: string): string {
	if (explicit) return resolve(expandUserPath(explicit));
	const fromEnv = process.env.PI_CODING_AGENT_DIR;
	if (fromEnv) return resolve(expandUserPath(fromEnv));
	return join(homedir(), ".pi", "agent");
}

export function agentPaths(agentDir: string): AgentPaths {
	return {
		dir: agentDir,
		auth: join(agentDir, "auth.json"),
		settings: join(agentDir, "settings.json"),
		models: join(agentDir, "models.json"),
	};
}
