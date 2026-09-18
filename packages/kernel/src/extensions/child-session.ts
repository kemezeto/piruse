import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	AgentHarness,
	type AgentHarnessTool,
	type AgentMessage,
	BACKGROUND_CONTEXT,
	type Context,
	type ExecutionToolContext,
	getOrThrow,
	type JsonlSessionMetadata,
	JsonlSessionRepo,
	type Session,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { Api, Model, MutableModels } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { compactionSettings } from "../compaction/settings.ts";
import { globTool } from "../tools/builtin/glob.ts";
import { toolText } from "../tools/builtin/result.ts";
import { walkFiles } from "../tools/builtin/walk.ts";
import { createExtensionHost, installExtensionHooks, runExtensionFactory, wrapExtensionTool } from "./host.ts";
import { getExtensionJiti } from "./loader.ts";
import type { ExtensionRuntime, ExtensionRuntimeSource } from "./runtime.ts";
import type { ExtensionFactory } from "./types.ts";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

interface ChildSessionEvent {
	type: string;
	[key: string]: unknown;
}

interface ChildSessionStorage {
	kind: "file" | "dir" | "default" | "memory";
	sessionFile?: string;
	sessionDir?: string;
}

interface ChildHookExtension {
	name: string;
	factory: ExtensionFactory;
}

interface ChildSessionLaunch {
	cwd: string;
	storage: ChildSessionStorage;
	model?: string;
	tools?: string[];
	excludeTools?: string[];
	extensionPaths: string[];
	ambientExtensions: boolean;
	hooks: ChildHookExtension[];
	noSkills: boolean;
	noContextFiles: boolean;
	systemPrompt?: string;
	appendSystemPrompt?: string;
	onExtensionError?: (error: { extensionPath: string; event: string; error: unknown }) => void;
}

interface ChildSession {
	subscribe(listener: (event: ChildSessionEvent) => void): () => void;
	prompt(text: string): Promise<void>;
	steer(text: string): Promise<void>;
	followUp(text: string): Promise<void>;
	abort(): Promise<void>;
	dispose(): Promise<void>;
	hasQueuedMessages?(): boolean;
	readonly messages: readonly AgentMessage[];
	readonly sessionFile: string | undefined;
	readonly sessionId: string;
	readonly modelId: string | undefined;
	detached?: boolean;
	shutDown?: boolean;
}

interface ChildSessionFactory {
	create(launch: ChildSessionLaunch): Promise<ChildSession>;
	dispose(): Promise<void>;
}

const CHILD_EVENT_TYPES = [
	"run_start",
	"run_end",
	"turn_start",
	"turn_end",
	"retry_start",
	"retry_end",
	"message_start",
	"message_update",
	"message_end",
	"tool_start",
	"tool_end",
	"compaction_start",
	"compaction_end",
	"queue_update",
] as const;

export function isPiSubagentsPath(extensionPath: string): boolean {
	const normalized = extensionPath.replaceAll("\\", "/");
	return normalized.includes("/pi-subagents/") || /\/pi-subagents$/i.test(normalized);
}

export async function installPiruseChildSessionFactory(
	extensionPath: string,
	runtime: ExtensionRuntimeSource,
): Promise<ChildSessionFactory | undefined> {
	const modulePath = childSessionModulePath(extensionPath);
	if (!modulePath) return undefined;
	const loaded = await getExtensionJiti().import(modulePath);
	const module = childSessionExports(loaded);
	if (typeof module?.setChildSessionFactory !== "function") return undefined;
	const factory = createPiruseChildSessionFactory(runtime);
	module.setChildSessionFactory(factory);
	return factory;
}

export async function resetPiruseChildSessionFactory(extensionPath: string): Promise<void> {
	const modulePath = childSessionModulePath(extensionPath);
	if (!modulePath) return;
	try {
		const loaded = await getExtensionJiti().import(modulePath);
		childSessionExports(loaded)?.setChildSessionFactory?.(undefined);
	} catch {
		// module may not have loaded
	}
}

function childSessionExports(loaded: unknown): { setChildSessionFactory?: (factory: ChildSessionFactory | undefined) => void } | undefined {
	if (!loaded || typeof loaded !== "object") return undefined;
	const record = loaded as { setChildSessionFactory?: unknown; default?: { setChildSessionFactory?: unknown } };
	if (typeof record.setChildSessionFactory === "function") {
		return record as { setChildSessionFactory: (factory: ChildSessionFactory | undefined) => void };
	}
	if (record.default && typeof record.default.setChildSessionFactory === "function") {
		return record.default as { setChildSessionFactory: (factory: ChildSessionFactory | undefined) => void };
	}
	return undefined;
}

function childSessionModulePath(extensionPath: string): string | undefined {
	const root = piSubagentsRoot(extensionPath);
	if (!root) return undefined;
	const candidates = [
		join(root, "src/runs/shared/child-session.ts"),
		join(root, "dist/runs/shared/child-session.js"),
		join(root, "src/runs/shared/child-session.js"),
	];
	return candidates.find((path) => existsSync(path));
}

function piSubagentsRoot(extensionPath: string): string | undefined {
	const normalized = extensionPath.replaceAll("\\", "/");
	const marker = "/pi-subagents/";
	const index = normalized.lastIndexOf(marker);
	if (index >= 0) return extensionPath.slice(0, index + "/pi-subagents".length);
	if (normalized.endsWith("/pi-subagents")) return extensionPath;
	return undefined;
}

function createPiruseChildSessionFactory(runtime: ExtensionRuntimeSource): ChildSessionFactory {
	const live = new Set<ChildSession>();
	return {
		async create(launch) {
			const host = runtime();
			if (!host) throw new Error("piruse extension runtime is not bound");
			const child = await openPiruseChildSession(launch, host);
			live.add(child);
			const dispose = child.dispose.bind(child);
			child.dispose = async () => {
				live.delete(child);
				await dispose();
			};
			return child;
		},
		async dispose() {
			const children = [...live].filter((child) => !child.detached);
			for (const child of children) child.shutDown = true;
			await Promise.allSettled(children.map((child) => child.abort()));
			await Promise.allSettled(children.map((child) => child.dispose()));
			live.clear();
		},
	};
}

async function openPiruseChildSession(launch: ChildSessionLaunch, host: ExtensionRuntime): Promise<ChildSession> {
	const context = host.context ?? BACKGROUND_CONTEXT;
	const executionEnv = new NodeExecutionEnv({ cwd: launch.cwd });
	const { session, repo } = await openChildJsonl(launch, host, executionEnv, context);
	const holder = childRuntimeHolder(launch, host, session);
	const loadedHooks = await loadChildHookTools(launch, host.models, holder);
	const tools = selectChildTools(host.profile.tools(), launch, loadedHooks.tools);
	const resolved = resolveChildModel(host.models, launch.model, host.model, host.thinkingLevel);
	const { harness } = await AgentHarness.create(
		{
			session,
			models: host.models,
			model: resolved.model,
			thinkingLevel: resolved.thinkingLevel,
			tools,
			activeToolNames: tools.map((tool) => tool.name),
			toolContext: { env: executionEnv },
			systemPrompt: () => childSystemPrompt(launch, host),
			compaction: compactionSettings,
		},
		context,
	);
	installExtensionHooks(
		harness,
		[
			{
				path: "<pi-subagents-child-hooks>",
				name: "child-hooks",
				tools: [],
				providers: [],
				providerIds: [],
				commands: [],
				unsupported: [],
				hooks: loadedHooks.hooks,
			},
		],
		launch.cwd,
		() => holder.current,
	);
	const lane = await harness.lane("main", context);
	const messages: AgentMessage[] = [];
	for (const entry of await session.findEntries({ type: "message", order: "asc", limit: 10_000 }, context)) {
		if (entry.type === "message") messages.push(entry.message);
	}
	const listeners = new Set<(event: ChildSessionEvent) => void>();
	let queued = false;
	const events = harness.events as {
		on(type: string, listener: (event: unknown, ctx: Context) => void): () => void;
	};
	const unsubs = CHILD_EVENT_TYPES.map((type) =>
		events.on(type, (event) => {
			for (const item of mapHarnessEvent(event as { type: string; [key: string]: unknown })) {
				if (item.type === "message_end" && item.message && typeof item.message === "object") {
					messages.push(item.message as AgentMessage);
				}
				if (item.type === "queue_update") queued = Array.isArray(item.queues) && item.queues.length > 0;
				for (const listener of listeners) listener(item);
			}
		}),
	);

	let disposed = false;
	const disposeSession = async (): Promise<void> => {
		if (disposed) return;
		disposed = true;
		for (const unsub of unsubs) unsub();
		listeners.clear();
		await harness.close(context).catch(() => {});
		await repo.close(context).catch(() => {});
		await executionEnv.cleanup(context).catch(() => {});
	};

	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		async prompt(text) {
			getOrThrow(await lane.prompt(text, undefined, context));
		},
		async steer(text) {
			getOrThrow(await lane.steer(text, undefined, context));
		},
		async followUp(text) {
			getOrThrow(await lane.followUp(text, undefined, context));
		},
		async abort() {
			await lane.abort(context).catch(() => {});
		},
		dispose: disposeSession,
		hasQueuedMessages: () => queued,
		get messages() {
			return messages;
		},
		get sessionFile() {
			return session.metadata.path;
		},
		get sessionId() {
			return session.metadata.id;
		},
		get modelId() {
			return `${resolved.model.provider}/${resolved.model.id}`;
		},
	};
}

function childRuntimeHolder(
	launch: ChildSessionLaunch,
	host: ExtensionRuntime,
	session: Session<JsonlSessionMetadata>,
): { current: ExtensionRuntime } {
	return {
		current: {
			...host,
			cwd: launch.cwd,
			sessionId: session.metadata.id,
			sessionFile: session.metadata.path,
			isIdle: () => true,
			abortParent() {},
			appendEntry() {},
			appendMessage() {},
			sendMessage() {},
			getSessionName: () => undefined,
		},
	};
}

async function loadChildHookTools(
	launch: ChildSessionLaunch,
	models: MutableModels,
	holder: { current: ExtensionRuntime },
): Promise<{
	tools: AgentHarnessTool<ExecutionToolContext>[];
	hooks: Array<{ event: string; handler: (...args: unknown[]) => unknown }>;
}> {
	const diagnostics: Array<{ level: "error" | "warning"; message: string; path?: string }> = [];
	const host = createExtensionHost({
		cwd: launch.cwd,
		models,
		diagnostics,
		providerSnapshots: new Map(),
		runtime: () => holder.current,
	});
	host.record.path = "<pi-subagents-child-hooks>";
	host.record.name = "child-hooks";
	for (const hook of launch.hooks) {
		try {
			await runExtensionFactory(hook.factory, host.api);
		} catch (error) {
			launch.onExtensionError?.({ extensionPath: hook.name, event: "load", error });
		}
	}
	host.commitProviders();
	return {
		tools: host.record.tools.map((tool) => wrapExtensionTool(tool, launch.cwd, () => holder.current)),
		hooks: host.record.hooks,
	};
}

function selectChildTools(
	profileTools: AgentHarnessTool<ExecutionToolContext>[],
	launch: ChildSessionLaunch,
	hookTools: AgentHarnessTool<ExecutionToolContext>[],
): AgentHarnessTool<ExecutionToolContext>[] {
	const byName = new Map<string, AgentHarnessTool<ExecutionToolContext>>();
	for (const tool of [...profileTools, ...discoveryTools(), ...hookTools]) {
		byName.set(tool.name, tool);
	}
	const exclude = new Set(launch.excludeTools ?? []);
	let selected = [...byName.values()].filter((tool) => !exclude.has(tool.name));
	if (launch.tools) {
		const allow = new Set(launch.tools);
		selected = selected.filter((tool) => allow.has(tool.name));
	}
	return selected;
}

function discoveryTools(): AgentHarnessTool<ExecutionToolContext>[] {
	const glob = globTool();
	return [
		{
			name: "ls",
			label: "ls",
			description: "List files in a directory.",
			parameters: Type.Object({
				path: Type.Optional(Type.String({ description: "Directory to list (default: working directory)" })),
			}),
			async execute(_id, raw, _onUpdate, { env }, _invocation, context) {
				const params = raw as { path?: string };
				const root = getOrThrow(await env.absolutePath(params.path?.trim() || ".", context));
				const listed = await env.listDir(root, context);
				if (!listed.ok) return toolText(listed.error.message, true);
				if (listed.value.length === 0) return toolText("(empty)");
				return toolText(
					listed.value.map((entry) => (entry.kind === "directory" ? `${entry.name}/` : entry.name)).join("\n"),
				);
			},
		} satisfies AgentHarnessTool<ExecutionToolContext>,
		{
			name: "find",
			label: "find",
			description: "Find files under a directory. Optional glob-style pattern.",
			parameters: Type.Object({
				path: Type.Optional(Type.String({ description: "Directory to search (default: working directory)" })),
				pattern: Type.Optional(Type.String({ description: "Optional glob pattern, e.g. '*.ts'" })),
			}),
			async execute(_id, raw, onUpdate, toolContext, invocation, context) {
				const params = raw as { path?: string; pattern?: string };
				const pattern = params.pattern?.trim();
				if (pattern) {
					return glob.execute(_id, { pattern, path: params.path }, onUpdate, toolContext, invocation, context);
				}
				const root = getOrThrow(await toolContext.env.absolutePath(params.path?.trim() || ".", context));
				const files = await walkFiles(toolContext.env, root, context);
				if (files.length === 0) return toolText("No files found.");
				return toolText(files.join("\n"));
			},
		} satisfies AgentHarnessTool<ExecutionToolContext>,
	];
}

function childSystemPrompt(launch: ChildSessionLaunch, host: ExtensionRuntime): string {
	const skills = launch.noSkills ? [] : host.skills;
	const base =
		launch.systemPrompt ??
		host.profile.systemPrompt(launch.cwd, skills, {
			provider: host.model.provider,
			modelId: host.model.id,
			thinkingLevel: host.thinkingLevel,
		});
	return launch.appendSystemPrompt ? `${base}\n\n${launch.appendSystemPrompt}` : base;
}

async function openChildJsonl(
	launch: ChildSessionLaunch,
	host: ExtensionRuntime,
	executionEnv: NodeExecutionEnv,
	context: Context,
): Promise<{ session: Session<JsonlSessionMetadata>; repo: JsonlSessionRepo }> {
	const storage = launch.storage;
	if (storage.kind === "file" && storage.sessionFile && existsSync(storage.sessionFile)) {
		const repo = new JsonlSessionRepo({ fileSystem: executionEnv, sessionsRoot: dirname(storage.sessionFile) });
		return { session: await repo.open(metadataFromFile(storage.sessionFile, launch.cwd), context), repo };
	}
	const root =
		storage.kind === "dir" && storage.sessionDir
			? storage.sessionDir
			: storage.kind === "file" && storage.sessionFile
				? dirname(storage.sessionFile)
				: join(host.sessionsRoot, "subagents");
	mkdirSync(root, { recursive: true });
	const repo = new JsonlSessionRepo({ fileSystem: executionEnv, sessionsRoot: root });
	return { session: await repo.create({ cwd: launch.cwd }, context), repo };
}

function metadataFromFile(path: string, cwd: string): JsonlSessionMetadata {
	const first = readFileSync(path, "utf8")
		.split("\n")
		.find((line) => line.trim());
	if (!first) throw new Error(`Empty session file: ${path}`);
	const header = JSON.parse(first) as {
		id?: string;
		createdAt?: number;
		cwd?: string;
		storageVersion?: number;
	};
	const stats = statSync(path);
	return {
		id: header.id ?? "child",
		createdAt: header.createdAt ?? stats.mtimeMs,
		storageVersion: header.storageVersion ?? 1,
		cwd: header.cwd ?? cwd,
		path,
		modifiedAt: stats.mtimeMs,
	};
}

function resolveChildModel(
	models: MutableModels,
	reference: string | undefined,
	fallback: { provider: string; id: string },
	thinkingLevel: string,
): { model: Model<Api>; thinkingLevel: ThinkingLevel } {
	const parsed = parseModelRef(reference);
	const catalog = models.getModels();
	const found = parsed
		? parsed.provider
			? (models.getModel(parsed.provider, parsed.id) ?? catalog.find((model) => model.id === parsed.id))
			: catalog.find((model) => model.id === parsed.id || `${model.provider}/${model.id}` === parsed.id)
		: undefined;
	const model = found ?? models.getModel(fallback.provider, fallback.id);
	if (!model) throw new Error(`Unknown child model ${reference ?? `${fallback.provider}/${fallback.id}`}`);
	return {
		model,
		thinkingLevel: (parsed?.thinking ?? thinkingLevel) as ThinkingLevel,
	};
}

function parseModelRef(reference: string | undefined): { provider?: string; id: string; thinking?: string } | undefined {
	if (!reference?.trim()) return undefined;
	let base = reference.trim();
	let thinking: string | undefined;
	const colon = base.lastIndexOf(":");
	if (colon !== -1) {
		const suffix = base.slice(colon + 1);
		if ((THINKING_LEVELS as readonly string[]).includes(suffix)) {
			thinking = suffix;
			base = base.slice(0, colon);
		}
	}
	const slash = base.indexOf("/");
	if (slash > 0) return { provider: base.slice(0, slash), id: base.slice(slash + 1), thinking };
	return { id: base, thinking };
}

function mapHarnessEvent(event: { type: string; [key: string]: unknown }): ChildSessionEvent[] {
	switch (event.type) {
		case "run_start":
			return [{ ...event, type: "agent_start" }];
		case "retry_start":
			return [{ ...event, type: "auto_retry_start" }];
		case "tool_start":
			return [
				{
					type: "tool_execution_start",
					toolName: event.toolName,
					toolCallId: event.toolCallId,
					args: event.args,
				},
			];
		case "tool_end": {
			const result = event.result as { content?: unknown } | undefined;
			return [
				{ type: "tool_execution_end", toolName: event.toolName, toolCallId: event.toolCallId },
				{
					type: "tool_result_end",
					toolCallId: event.toolCallId,
					toolName: event.toolName,
					message: {
						role: "toolResult",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						content: result?.content ?? [],
						isError: event.isError,
					},
				},
			];
		}
		case "run_end":
			return [
				{ ...event, type: "agent_end" },
				{ ...event, type: "agent_settled" },
			];
		default:
			return [event];
	}
}
