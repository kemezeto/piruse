import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const allowed = join(root, "packages/kernel/src/runtime");
const importRe = /(?:from|import)\s*\(?\s*["']@earendil-works\/pi-agent-core(?:\/[^"']*)?["']/;

async function walk(dir, files = []) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return files;
		throw error;
	}
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "pisource") continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) await walk(path, files);
		else if (/\.(ts|tsx|js|mjs|mts)$/.test(entry.name)) files.push(path);
	}
	return files;
}

const files = [...(await walk(join(root, "packages"))), ...(await walk(join(root, "apps")))];
const bad = [];
for (const file of files) {
	if (file.startsWith(`${allowed}/`) || file.startsWith(`${allowed}\\`)) continue;
	const text = await readFile(file, "utf8");
	if (importRe.test(text)) bad.push(relative(root, file));
}

if (bad.length > 0) {
	console.error("pi-agent-core import outside packages/kernel/src/runtime/:");
	for (const file of bad) console.error(`  ${file}`);
	process.exit(1);
}
