import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { agentPaths, resolveAgentDir } from "../models/paths.ts";
import {
	collectExtensionFiles,
	collectPackageExtensionFiles,
	listInstalledPackageDirs,
	resolveConfiguredPath,
	uniqueExisting,
} from "../packages/discover.ts";
import { loadPackageSettings } from "../packages/settings.ts";

export async function discoverUserExtensions(options: { cwd: string; agentDir?: string }): Promise<string[]> {
	const agentDir = resolveAgentDir(options.agentDir);
	const settings = await loadPackageSettings(agentPaths(agentDir).settings);
	const files: string[] = [];
	files.push(...collectExtensionFiles(join(agentDir, "extensions")));
	for (const packageDir of listInstalledPackageDirs(agentDir)) {
		files.push(...collectPackageExtensionFiles(packageDir));
	}
	for (const raw of settings.extensions) {
		const resolved = resolveConfiguredPath(raw, options.cwd);
		if (!existsSync(resolved)) continue;
		try {
			const stats = statSync(resolved);
			if (stats.isFile()) files.push(resolved);
			else if (stats.isDirectory()) files.push(...collectExtensionFiles(resolved));
		} catch {
			// ignore unreadable configured paths
		}
	}
	return uniqueExisting(files);
}
