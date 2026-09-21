import type { Context, ExecutionEnv, FileInfo } from "../../runtime/index.ts";
import { pathIsSkipped } from "./skip.ts";

const MAX_WALK_FILES = 8000;

/** Depth-first file paths under root, skipping junk directories. */
export async function walkFiles(
	env: ExecutionEnv,
	root: string,
	context: Context,
	limit = MAX_WALK_FILES,
): Promise<string[]> {
	const listed = await env.listDir(root, context);
	if (!listed.ok) return [];
	const files: string[] = [];
	const stack: FileInfo[] = [...listed.value];
	while (stack.length > 0 && files.length < limit) {
		if (context.abortSignal?.aborted) break;
		const entry = stack.pop();
		if (!entry) break;
		if (pathIsSkipped(entry.name)) continue;
		if (entry.kind === "directory") {
			const children = await env.listDir(entry.path, context);
			if (children.ok) stack.push(...children.value);
			continue;
		}
		if (entry.kind === "file") files.push(entry.path);
	}
	return files;
}
