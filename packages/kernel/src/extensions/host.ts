import type { AgentHarness, AgentHarnessTool, ExecutionToolContext } from "@earendil-works/pi-agent-core";
import { type Api, createProvider, envApiKeyAuth, type MutableModels, type Provider } from "@earendil-works/pi-ai";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import { runCommand } from "../tools/builtin/run.ts";
import { asAgentMessage, createExtensionContext, customTypeOf, type ExtensionRuntimeSource } from "./runtime.ts";
import {
	defineTool,
	noOpUI,
	type ExtensionAPI,
	type ExtensionFactory,
	type ProviderConfig,
	type ToolDefinition,
} from "./types.ts";

export interface PackageDiagnostic {
	level: "error" | "warning";
	message: string;
	path?: string;
}

export interface LoadedExtension {
	path: string;
	name: string;
	tools: ToolDefinition[];
	providers: Provider[];
	providerIds: string[];
	commands: string[];
	unsupported: string[];
	hooks: Array<{ event: string; handler: (...args: unknown[]) => unknown }>;
}

const HARNESS_HOOKS = new Set(["before_tool", "after_tool", "tool_call", "tool_result"]);

export function createExtensionHost(options: {
	cwd: string;
	models: MutableModels;
	diagnostics: PackageDiagnostic[];
	providerSnapshots: Map<string, Provider | undefined>;
	runtime?: ExtensionRuntimeSource;
}): {
	api: ExtensionAPI;
	record: LoadedExtension;
	commitProviders: () => void;
} {
	const record: LoadedExtension = {
		path: "",
		name: "",
		tools: [],
		providers: [],
		providerIds: [],
		commands: [],
		unsupported: [],
		hooks: [],
	};
	const flags = new Map<string, boolean | string>();
	const pendingProviders: Array<{ id: string; provider: Provider }> = [];
	const channels = new Map<string, Set<(data: unknown) => void>>();
	const listedTools = () => [
		...(options.runtime?.()?.profile.tools() ?? []).map((tool) => ({
			name: tool.name,
			description: tool.description,
		})),
		...record.tools.map((tool) => ({ name: tool.name, description: tool.description })),
	];

	const unsupported = (capability: string): void => {
		if (!record.unsupported.includes(capability)) record.unsupported.push(capability);
		options.diagnostics.push({
			level: "warning",
			message: `unsupported in piruse: ${capability}`,
			path: record.path || undefined,
		});
	};

	const api: ExtensionAPI = {
		on(event, handler) {
			if (!HARNESS_HOOKS.has(event)) {
				unsupported(`event:${event}`);
				return;
			}
			record.hooks.push({ event, handler });
		},
		registerTool(tool) {
			record.tools.push(defineTool(tool));
		},
		registerCommand(name) {
			record.commands.push(name);
			unsupported(`command:/${name}`);
		},
		registerShortcut(shortcut) {
			unsupported(`shortcut:${shortcut}`);
		},
		registerFlag(name, flagOptions) {
			if (flagOptions.default !== undefined && !flags.has(name)) flags.set(name, flagOptions.default);
		},
		getFlag(name) {
			return flags.get(name);
		},
		registerMessageRenderer() {
			unsupported("registerMessageRenderer");
		},
		registerMarkdownTransformer() {
			unsupported("registerMarkdownTransformer");
		},
		registerEntryRenderer() {
			unsupported("registerEntryRenderer");
		},
		sendMessage(message) {
			const live = options.runtime?.();
			if (!live) return;
			const customType = customTypeOf(message);
			if (customType) {
				live.appendEntry(customType, message);
				return;
			}
			const agentMessage = asAgentMessage(message);
			if (agentMessage) live.appendMessage(agentMessage);
		},
		sendUserMessage() {
			unsupported("sendUserMessage");
		},
		appendEntry(customType, data) {
			options.runtime?.()?.appendEntry(customType, data);
		},
		setSessionName() {
			unsupported("setSessionName");
		},
		getSessionName() {
			return options.runtime?.()?.getSessionName();
		},
		setLabel() {
			unsupported("setLabel");
		},
		async exec(command, args, execOptions) {
			const result = await runCommand(command, args, { cwd: execOptions?.cwd ?? options.cwd });
			return { code: result.code, stdout: result.stdout, stderr: result.stderr };
		},
		getActiveTools() {
			return listedTools().map((tool) => tool.name);
		},
		getAllTools() {
			return listedTools();
		},
		setActiveTools() {
			unsupported("setActiveTools");
		},
		getCommands() {
			return record.commands.map((name) => ({ name: `/${name}` }));
		},
		async setModel() {
			unsupported("setModel");
			return false;
		},
		getThinkingLevel() {
			return options.runtime?.()?.thinkingLevel ?? "off";
		},
		setThinkingLevel() {
			unsupported("setThinkingLevel");
		},
		registerProvider(providerOrName: Provider | string, config?: ProviderConfig) {
			if (typeof providerOrName !== "string") {
				pendingProviders.push({ id: providerOrName.id, provider: providerOrName });
				return;
			}
			if (!config) throw new Error("Provider config is required when registering by name");
			pendingProviders.push({ id: providerOrName, provider: providerFromConfig(providerOrName, config) });
		},
		unregisterProvider(name) {
			const index = pendingProviders.findIndex((entry) => entry.id === name);
			if (index >= 0) pendingProviders.splice(index, 1);
			restoreProvider(options.models, options.providerSnapshots, name);
			record.providerIds = record.providerIds.filter((id) => id !== name);
		},
		events: {
			emit(channel, data) {
				for (const handler of channels.get(channel) ?? []) handler(data);
			},
			on(channel, handler) {
				const set = channels.get(channel) ?? new Set();
				set.add(handler);
				channels.set(channel, set);
				return () => set.delete(handler);
			},
		},
		ui: new Proxy(noOpUI, {
			get(target, prop, receiver) {
				if (typeof prop === "string" && prop !== "theme") unsupported(`ui.${prop}`);
				return Reflect.get(target, prop, receiver);
			},
		}),
	};

	return {
		api,
		record,
		commitProviders() {
			for (const entry of pendingProviders) {
				rememberProvider(options.models, options.providerSnapshots, entry.id);
				options.models.setProvider(entry.provider);
				record.providers.push(entry.provider);
				record.providerIds.push(entry.id);
			}
			pendingProviders.length = 0;
		},
	};
}

export async function runExtensionFactory(
	factory: ExtensionFactory,
	api: ExtensionAPI,
): Promise<void> {
	await factory(api);
}

export function wrapExtensionTool(
	definition: ToolDefinition,
	cwd: string,
	runtime: ExtensionRuntimeSource = () => undefined,
): AgentHarnessTool<ExecutionToolContext> {
	return {
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		constrainedSampling: definition.constrainedSampling as AgentHarnessTool<ExecutionToolContext>["constrainedSampling"],
		prepareArguments: definition.prepareArguments,
		executionMode: definition.executionMode,
		execute: async (toolCallId, params, onUpdate, _toolContext, _invocation, context) => {
			return definition.execute(
				toolCallId,
				params,
				context.abortSignal,
				onUpdate,
				createExtensionContext(cwd, context.abortSignal, runtime()),
			);
		},
	};
}

export function installExtensionHooks(
	harness: AgentHarness,
	loaded: LoadedExtension[],
	cwd: string,
	runtime: ExtensionRuntimeSource = () => undefined,
): void {
	for (const extension of loaded) {
		for (const hook of extension.hooks) {
			if (hook.event === "tool_call" || hook.event === "before_tool") {
				harness.hooks.on("before_tool", async (event) => {
					const payload = {
						type: "tool_call",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.args,
					};
					const result = (await hook.handler(payload, createExtensionContext(cwd, undefined, runtime()))) as
						| { block?: boolean; reason?: string; terminate?: boolean }
						| undefined;
					if (result?.block) {
						return { block: { reason: result.reason ?? "blocked by extension", terminate: result.terminate } };
					}
					if (payload.input !== event.args) {
						return { args: payload.input as typeof event.args };
					}
					return undefined;
				});
			}
			if (hook.event === "tool_result" || hook.event === "after_tool") {
				harness.hooks.on("after_tool", async (event) => {
					const payload = {
						type: "tool_result",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.args,
						content: event.content,
						details: event.details,
						isError: event.isError,
						usage: event.usage,
					};
					const result = (await hook.handler(payload, createExtensionContext(cwd, undefined, runtime()))) as
						| { content?: typeof event.content; details?: typeof event.details; isError?: boolean; usage?: typeof event.usage }
						| undefined;
					if (!result) return undefined;
					return {
						content: result.content,
						details: result.details,
						isError: result.isError,
						usage: result.usage,
					};
				});
			}
		}
	}
}

function rememberProvider(models: MutableModels, snapshots: Map<string, Provider | undefined>, id: string): void {
	if (!snapshots.has(id)) snapshots.set(id, models.getProvider(id));
}

function restoreProvider(models: MutableModels, snapshots: Map<string, Provider | undefined>, id: string): void {
	const previous = snapshots.get(id);
	if (previous) models.setProvider(previous);
	else models.deleteProvider(id);
	snapshots.delete(id);
}

function providerFromConfig(id: string, config: ProviderConfig): Provider {
	if (config.oauth) {
		throw new Error(`Provider "${id}" uses OAuth, which piruse does not host`);
	}
	const api = (config.api ?? config.models?.[0]?.api ?? "openai-completions") as Api;
	const impl = config.streamSimple
		? { stream: config.streamSimple, streamSimple: config.streamSimple }
		: getApiProvider(api);
	if (!impl) throw new Error(`Unsupported API "${api}" for provider "${id}"`);
	const baseUrl = config.baseUrl ?? config.models?.[0]?.baseUrl;
	if (!baseUrl) throw new Error(`Provider ${id}: baseUrl is required`);
	const catalog = (config.models ?? []).map((model) => ({
		id: model.id,
		name: model.name,
		api: (model.api ?? api) as Api,
		provider: id,
		baseUrl: model.baseUrl ?? baseUrl,
		reasoning: model.reasoning,
		input: model.input,
		cost: model.cost,
		contextWindow: model.contextWindow,
		maxTokens: model.maxTokens,
		compat: model.compat,
	}));
	const envVars = config.apiKey?.startsWith("$")
		? [config.apiKey.replace(/^\$\{?/, "").replace(/\}$/, "")]
		: [];
	return createProvider({
		id,
		name: config.name ?? id,
		baseUrl,
		headers: config.headers,
		auth: { apiKey: envApiKeyAuth(`${config.name ?? id} API key`, envVars) },
		models: catalog,
		api: { stream: impl.stream, streamSimple: impl.streamSimple },
	});
}
