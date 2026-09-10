/**
 * CLI: one prompt against the durable harness, then exit.
 *
 *   npm start -- "What files are in this directory?"
 *   npm start -- --continue
 *   npm start -- --model deepseek/deepseek-v4-flash "…"
 */

import { resolve } from "node:path";
import { bootHarness } from "../../packages/kernel/src/create-kernel.ts";
import { parseArgs } from "../flags.ts";
import { expandUserPath } from "../../packages/kernel/src/session/projects.ts";

function fail(error: { message: string } | string): never {
	throw new Error(typeof error === "string" ? error : error.message);
}

const args = parseArgs(process.argv.slice(2));
if (!args.prompt && !args.continueSession && !args.sessionId) {
	console.error('Usage: npm start -- "What files are in this directory?"');
	console.error("       npm start -- --continue");
	console.error("       npm start -- --model deepseek/deepseek-v4-flash \"…\"");
	process.exit(1);
}

const boot = await bootHarness({
	cwd: args.cwd ? resolve(expandUserPath(args.cwd)) : process.cwd(),
	sessionsRoot: args.sessionsRoot,
	sessionId: args.sessionId,
	continueSession: args.continueSession,
	provider: args.provider,
	model: args.model,
	agentDir: args.agentDir,
	permissionMode: args.permission,
});
const watch = await boot.lane.watch(boot.context);

process.stderr.write(
	`session ${boot.session.metadata.id}\npath    ${boot.session.metadata.path}\nmodel   ${boot.model.provider}/${boot.model.id}\n${boot.authSource ? `auth    ${boot.authSource}\n` : ""}`,
);
if (boot.open.length > 0) {
	process.stderr.write(`resume  ${boot.open.map((operation) => `${operation.lane}/${operation.operationId}`).join(", ")}\n`);
}

watch.start((event) => {
	if (event.type === "message_update" && event.event.type === "text_delta") {
		process.stdout.write(event.event.delta);
	} else if (event.type === "tool_start") {
		const toolArgs = event.args as { command?: string; path?: string };
		process.stderr.write(`\n[${event.toolName}] ${toolArgs.command ?? toolArgs.path ?? ""}\n`);
	} else if (event.type === "run_end" && event.status === "failed") {
		process.stderr.write(`\n[run failed] ${event.error.message}\n`);
	}
});

try {
	await boot.resumeOpen();
	if (args.prompt) {
		const result = await boot.lane.prompt(args.prompt, undefined, boot.context);
		if (!result.ok) fail(result.error);
	} else if (boot.open.length === 0) {
		process.stderr.write("idle (pass a prompt to continue this session)\n");
	}
	process.stdout.write("\n");
} finally {
	watch.unsubscribe();
	await boot.close();
}
