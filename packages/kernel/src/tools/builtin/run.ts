import { spawn } from "node:child_process";

export interface CommandResult {
	code: number | null;
	stdout: string;
	stderr: string;
	missing: boolean;
}

/** Spawn a binary with no shell. ENOENT means the binary is not on PATH. */
export function runCommand(
	command: string,
	args: string[],
	options: { cwd: string; signal?: AbortSignal },
): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new Error("aborted"));
			return;
		}
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		const onAbort = (): void => {
			child.kill();
		};
		options.signal?.addEventListener("abort", onAbort, { once: true });
		child.on("error", (error: NodeJS.ErrnoException) => {
			options.signal?.removeEventListener("abort", onAbort);
			if (error.code === "ENOENT") {
				resolve({ code: null, stdout: "", stderr: "", missing: true });
				return;
			}
			reject(error);
		});
		child.on("close", (code) => {
			options.signal?.removeEventListener("abort", onAbort);
			resolve({ code, stdout, stderr, missing: false });
		});
	});
}
