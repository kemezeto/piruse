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
const stop = await boot.subscribeRun({
	onText: (delta) => {
		process.stdout.write(delta);
	},
	onTool: (name, hint) => {
		process.stderr.write(`\n[${name}] ${hint}\n`);
	},
	onFail: (message) => {
		process.stderr.write(`\n[run failed] ${message}\n`);
	},
});

process.stderr.write(
	`session ${boot.sessionId}\npath    ${boot.sessionPath}\nmodel   ${boot.model.provider}/${boot.model.id}\n${boot.authSource ? `auth    ${boot.authSource}\n` : ""}`,
);
if (boot.resumeLabels.length > 0) {
	process.stderr.write(`resume  ${boot.resumeLabels.join(", ")}\n`);
}

try {
	await boot.resumeOpen();
	if (args.prompt) {
		await boot.rememberTitleFromPrompt(args.prompt);
		await boot.prompt(args.prompt);
	} else if (boot.resumeLabels.length === 0) {
		process.stderr.write("idle (pass a prompt to continue this session)\n");
	}
	process.stdout.write("\n");
} catch (error) {
	fail(error instanceof Error ? error : String(error));
} finally {
	stop();
	await boot.close();
}
