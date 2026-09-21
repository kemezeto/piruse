import { convertToLlm } from "../runtime/index.ts";
import { defineTool } from "./types.ts";

class TuiNode {
	addChild(_child: unknown): void {}
	add(..._children: unknown[]): this {
		return this;
	}
}

class Box extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Text extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Container extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Spacer extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Markdown extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Input extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class Component extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class TUI {
	constructor(..._args: unknown[]) {}
	start(): void {}
	stop(): void {}
}

class EditorComponent extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

class KeybindingsManager {
	constructor(..._args: unknown[]) {}
}

class DynamicBorder extends TuiNode {
	constructor(..._args: unknown[]) {
		super();
	}
}

const Key = {
	ctrl: (key: string) => `ctrl+${key}`,
	alt: (key: string) => `alt+${key}`,
	shift: (key: string) => `shift+${key}`,
	super: (key: string) => `super+${key}`,
	ctrlAlt: (key: string) => `ctrl+alt+${key}`,
	ctrlShift: (key: string) => `ctrl+shift+${key}`,
	altShift: (key: string) => `alt+shift+${key}`,
	ctrlAltShift: (key: string) => `ctrl+alt+shift+${key}`,
	enter: "enter",
	escape: "escape",
	tab: "tab",
	backspace: "backspace",
	delete: "delete",
	space: "space",
	up: "up",
	down: "down",
	left: "left",
	right: "right",
	home: "home",
	end: "end",
	pageUp: "pageup",
	pageDown: "pagedown",
};

function stripAnsi(text: string): string {
	return text.replace(/\u001B\[[0-9;]*m/g, "");
}

function visibleWidth(text: string): number {
	return stripAnsi(String(text ?? "")).length;
}

function truncateToWidth(text: string, width = Number.POSITIVE_INFINITY, ellipsis = "…"): string {
	const value = String(text ?? "");
	if (!Number.isFinite(width)) return value;
	if (width <= 0) return "";
	const plain = stripAnsi(value);
	if (plain.length <= width) return value;
	const marker = ellipsis ?? "";
	return `${plain.slice(0, Math.max(0, width - marker.length))}${marker}`;
}

function wrapTextWithAnsi(text: string, width: number): string[] {
	const value = String(text ?? "");
	if (value.length === 0) return [""];
	const lines: string[] = [];
	const limit = Math.max(1, width);
	for (const line of value.split("\n")) {
		if (visibleWidth(line) <= limit) {
			lines.push(line);
			continue;
		}
		const plain = stripAnsi(line);
		for (let index = 0; index < plain.length; index += limit) {
			lines.push(plain.slice(index, index + limit));
		}
	}
	return lines;
}

function matchesKey(_binding: unknown, _event: unknown): boolean {
	return false;
}

function isKeyRelease(_event: unknown): boolean {
	return false;
}

function fuzzyFilter<T>(items: T[], query: string, getter?: (item: T) => string): T[] {
	if (!query) return items;
	const needle = query.toLowerCase();
	return items.filter((item) => {
		const text = getter ? getter(item) : String(item);
		return text.toLowerCase().includes(needle);
	});
}

function keyText(key: string): string {
	const parts = String(key).split(".");
	return parts[parts.length - 1] ?? key;
}

function keyHint(key: string): string {
	return keyText(key);
}

function rawKeyHint(key: string): string {
	return keyText(key);
}

function getMarkdownTheme(): Record<string, unknown> {
	return {};
}

function getLanguageFromPath(_path: string): string {
	return "";
}

function highlightCode(code: string): string {
	return code;
}

function createReadOnlyTools(_cwd?: string): unknown[] {
	return [];
}

function dummySessionManager(sessionFile?: string) {
	return {
		getSessionFile: () => sessionFile,
		getSessionId: () => sessionFile,
		getLeafId: () => null,
		getSessionDir: () => undefined,
		getHeader: () => null,
		getEntries: () => [],
		getBranch: () => [],
		createBranchedSession: () => undefined,
		openSession: (file: string) => dummySessionManager(file),
	};
}

const SessionManager = {
	open(file: string, _dir?: string, _cwd?: string) {
		return dummySessionManager(file);
	},
	create(_cwd?: string, _dir?: string) {
		return dummySessionManager();
	},
	inMemory(_cwd?: string) {
		return dummySessionManager();
	},
};

function namedModule(exports: Record<string, unknown>): Record<string, unknown> {
	const target = { ...exports, default: exports };
	return new Proxy(target, {
		get(object, prop) {
			if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
			if (prop in object) return Reflect.get(object, prop);
			if (typeof prop !== "string") return undefined;
			const stub = (..._args: unknown[]) => stub;
			return stub;
		},
		has(object, prop) {
			if (prop === "then") return false;
			return true;
		},
	});
}

export const tuiShim = namedModule({
	Key,
	Box,
	Text,
	Container,
	Spacer,
	Markdown,
	Input,
	Component,
	TUI,
	EditorComponent,
	KeybindingsManager,
	MarkdownTheme: {},
	KeyId: "",
	matchesKey,
	isKeyRelease,
	fuzzyFilter,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
});

export const codingAgentShim = namedModule({
	defineTool,
	keyText,
	keyHint,
	rawKeyHint,
	getMarkdownTheme,
	getLanguageFromPath,
	highlightCode,
	DynamicBorder,
	createReadOnlyTools,
	convertToLlm,
	SessionManager,
});
