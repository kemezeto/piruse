import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface CliArgs {
	continueSession: boolean;
	sessionId: string | undefined;
	sessionsRoot: string;
	prompt: string;
	port: number;
	openBrowser: boolean;
	provider: string | undefined;
	model: string | undefined;
	agentDir: string | undefined;
	cwd: string | undefined;
	permission: "read" | "review" | "allow" | undefined;
}

export function parseArgs(argv: string[]): CliArgs {
	let continueSession = false;
	let sessionId: string | undefined;
	let sessionsRoot = join(homedir(), ".piruse", "sessions");
	let port = 8787;
	let openBrowser = true;
	let provider: string | undefined;
	let model: string | undefined;
	let agentDir: string | undefined;
	let cwd: string | undefined;
	let permission: "read" | "review" | "allow" | undefined;
	const promptParts: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--continue" || arg === "-c") {
			continueSession = true;
		} else if (arg === "--session" && next) {
			sessionId = next;
			i++;
		} else if (arg === "--sessions-root" && next) {
			sessionsRoot = resolve(next);
			i++;
		} else if (arg === "--port" && next) {
			port = Number(next);
			i++;
		} else if (arg === "--provider" && next) {
			provider = next;
			i++;
		} else if (arg === "--model" && next) {
			model = next;
			i++;
		} else if (arg === "--agent-dir" && next) {
			agentDir = next;
			i++;
		} else if (arg === "--cwd" && next) {
			cwd = next;
			i++;
		} else if (arg === "--permission" && next) {
			if (next !== "read" && next !== "review" && next !== "allow") {
				throw new Error("--permission must be read, review, or allow");
			}
			permission = next;
			i++;
		} else if (arg === "--no-open") {
			openBrowser = false;
		} else if (!arg.startsWith("-")) {
			promptParts.push(arg);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	return {
		continueSession,
		sessionId,
		sessionsRoot,
		prompt: promptParts.join(" ").trim(),
		port,
		openBrowser,
		provider,
		model,
		agentDir,
		cwd,
		permission,
	};
}
