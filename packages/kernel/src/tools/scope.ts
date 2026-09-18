import { homedir } from "node:os";
import { basename, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

const WRAPPERS = new Set(["timeout", "time", "nice", "nohup", "stdbuf", "command", "builtin", "env"]);
const TWO_TOKEN = new Set(["npm", "npx", "pnpm", "yarn", "bun", "git", "cargo", "make", "docker", "poetry", "uv", "pip", "go"]);
const INTERPRETERS = new Set(["bash", "sh", "zsh", "dash", "fish", "python", "python3", "node", "perl", "ruby", "php", "lua"]);
const READONLY_COMMANDS = new Set([
	"ls",
	"pwd",
	"echo",
	"true",
	"false",
	"cd",
	"cat",
	"head",
	"tail",
	"which",
	"whereis",
	"dirname",
	"basename",
	"wc",
	"date",
	"printf",
	"test",
	"[",
	"whoami",
	"hostname",
	"uname",
	"type",
	"command",
]);
const PROTECTED_SEGMENTS = new Set([".git", ".ssh", ".gnupg"]);
const PROTECTED_BASENAMES = new Set([
	".gitconfig",
	".gitmodules",
	".bashrc",
	".bash_profile",
	".bash_login",
	".bash_aliases",
	".bash_logout",
	".zshrc",
	".zprofile",
	".zshenv",
	".zlogin",
	".zlogout",
	".profile",
	".envrc",
	".netrc",
	".npmrc",
	"id_rsa",
	"id_ed25519",
	"id_ecdsa",
	"id_dsa",
	"authorized_keys",
	"known_hosts",
]);
const DEV_NULLS = new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "nul"]);

export type PathScope = "workspace" | "outside" | "protected";

export function expandUserPath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}

export function resolveToolPath(cwd: string, path: string): string {
	const expanded = expandUserPath(path.trim());
	return normalize(isAbsolute(expanded) ? expanded : resolve(cwd, expanded));
}

export function isInsideRoot(root: string, target: string): boolean {
	const rel = relative(normalize(root), normalize(target));
	return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function isEnvFileName(name: string): boolean {
	return name === ".env" || name.startsWith(".env.");
}

export function isProtectedPath(cwd: string, target: string): boolean {
	const abs = normalize(target);
	const parts = abs.split(/[/\\]/).filter(Boolean);
	if (parts.some((part) => PROTECTED_SEGMENTS.has(part))) return true;
	const name = basename(abs);
	if (PROTECTED_BASENAMES.has(name) || isEnvFileName(name)) return true;
	const home = homedir();
	if (isInsideRoot(join(home, ".ssh"), abs) || isInsideRoot(join(home, ".gnupg"), abs)) return true;
	if (isInsideRoot(join(cwd, ".git"), abs)) return true;
	return false;
}

export function pathScope(cwd: string, target: string): PathScope {
	if (isProtectedPath(cwd, target)) return "protected";
	return isInsideRoot(cwd, target) ? "workspace" : "outside";
}

export function displayPath(cwd: string, target: string): string {
	if (isInsideRoot(cwd, target)) {
		const rel = relative(cwd, target);
		return rel === "" ? "." : rel;
	}
	return target;
}

export function mutatePath(args: Record<string, unknown>): string | undefined {
	for (const key of ["path", "file_path", "filePath", "target"]) {
		const value = args[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

export function splitShell(command: string): string[] {
	const parts: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	const push = (): void => {
		const trimmed = current.trim();
		if (trimmed) parts.push(trimmed);
		current = "";
	};
	for (let index = 0; index < command.length; index++) {
		const char = command[index]!;
		if (quote) {
			if (escaped) {
				current += char;
				escaped = false;
				continue;
			}
			if (quote === '"' && char === "\\") {
				current += char;
				escaped = true;
				continue;
			}
			if (char === quote) quote = undefined;
			current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			current += char;
			continue;
		}
		if (char === "\n" || char === ";") {
			push();
			continue;
		}
		if (char === "&" && command[index + 1] === "&") {
			push();
			index++;
			continue;
		}
		if (char === "|" && command[index + 1] === "|") {
			push();
			index++;
			continue;
		}
		if (char === "|" || char === "&") {
			push();
			continue;
		}
		current += char;
	}
	push();
	return parts;
}

export function tokenize(command: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	const push = (): void => {
		if (current) tokens.push(current);
		current = "";
	};
	for (const char of command.trim()) {
		if (quote) {
			if (escaped) {
				current += char;
				escaped = false;
				continue;
			}
			if (quote === '"' && char === "\\") {
				escaped = true;
				continue;
			}
			if (char === quote) {
				quote = undefined;
				continue;
			}
			current += char;
			continue;
		}
		if (char === "'" || char === '"') {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			push();
			continue;
		}
		current += char;
	}
	push();
	return tokens;
}

export function unwrapTokens(tokens: readonly string[]): string[] {
	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index]!;
		if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
			index++;
			continue;
		}
		if (!WRAPPERS.has(token)) break;
		index++;
		if (token === "timeout" && tokens[index] && /^\d/.test(tokens[index]!)) index++;
	}
	return tokens.slice(index);
}

export function isInterpreterDash(tokens: readonly string[]): boolean {
	const unwrapped = unwrapTokens(tokens);
	const command = unwrapped[0];
	const flag = unwrapped[1];
	return Boolean(command && INTERPRETERS.has(command) && (flag === "-c" || flag === "-e" || flag === "-lc"));
}

export function commandPrefix(command: string): string | undefined {
	const first = splitShell(command)[0];
	if (!first) return undefined;
	const tokens = unwrapTokens(tokenize(first));
	if (tokens.length === 0 || isInterpreterDash(tokens)) return undefined;
	const name = tokens[0]!;
	const next = tokens[1];
	if (TWO_TOKEN.has(name) && next && !next.startsWith("-")) return `${name} ${next}`;
	return name;
}

export function isReadonlyCommand(command: string): boolean {
	const tokens = unwrapTokens(tokenize(command));
	const name = tokens[0];
	if (!name) return false;
	if (READONLY_COMMANDS.has(name)) return true;
	return name === "git" && Boolean(tokens[1]) && ["status", "diff", "log", "show", "rev-parse", "describe", "branch"].includes(tokens[1]!);
}

export function prefixMatches(command: string, prefixes: readonly string[]): boolean {
	if (prefixes.length === 0) return false;
	const parts = splitShell(command);
	if (parts.length === 0) return false;
	return parts.every((part) => {
		if (isReadonlyCommand(part)) return true;
		const rendered = unwrapTokens(tokenize(part)).join(" ");
		return prefixes.some((prefix) => rendered === prefix || rendered.startsWith(`${prefix} `));
	});
}

export function redirectTargets(command: string): string[] {
	const targets: string[] = [];
	for (const part of splitShell(command)) {
		const tokens = unwrapTokens(tokenize(part));
		if (tokens[0] === "tee") {
			for (const token of tokens.slice(1)) {
				if (!token.startsWith("-") && !DEV_NULLS.has(token.toLowerCase())) targets.push(token);
			}
		}
		let quote: "'" | '"' | undefined;
		for (let index = 0; index < part.length; index++) {
			const char = part[index]!;
			if (quote) {
				if (char === quote) quote = undefined;
				continue;
			}
			if (char === "'" || char === '"') {
				quote = char;
				continue;
			}
			if (char !== ">") continue;
			let cursor = index + 1;
			if (part[cursor] === ">") cursor++;
			while (cursor < part.length && /\s/.test(part[cursor]!)) cursor++;
			if (part[cursor] === "&") continue;
			let target = "";
			const opener = part[cursor];
			if (opener === "'" || opener === '"') {
				cursor++;
				while (cursor < part.length && part[cursor] !== opener) {
					target += part[cursor]!;
					cursor++;
				}
			} else {
				while (cursor < part.length && !/\s/.test(part[cursor]!)) {
					target += part[cursor]!;
					cursor++;
				}
			}
			if (target && !DEV_NULLS.has(target.toLowerCase())) targets.push(target);
			index = cursor - 1;
		}
	}
	return targets;
}
