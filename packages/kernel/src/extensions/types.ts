import type { AgentToolResult, AgentToolUpdateCallback, ToolExecutionMode } from "@earendil-works/pi-agent-core";
import type { Api, Model, Provider } from "@earendil-works/pi-ai";
import type { Static, TSchema } from "typebox";

export type ExtensionMode = "tui" | "rpc" | "json" | "print";

export interface ExtensionUIDialogOptions {
	signal?: AbortSignal;
	timeout?: number;
}

export interface ExtensionWidgetOptions {
	placement?: "aboveEditor" | "belowEditor";
}

export interface ExtensionUIContext {
	select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
	confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean>;
	input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
	onTerminalInput(handler: (data: string) => { consume?: boolean; data?: string } | undefined): () => void;
	setStatus(key: string, text: string | undefined): void;
	setWorkingMessage(message?: string): void;
	setWorkingVisible(visible: boolean): void;
	setWorkingIndicator(options?: { frames?: string[]; intervalMs?: number }): void;
	setHiddenThinkingLabel(label?: string): void;
	setWidget(key: string, content: unknown, options?: ExtensionWidgetOptions): void;
	setFooter(factory: unknown): void;
	setHeader(factory: unknown): void;
	setTitle(title: string): void;
	custom<T>(factory: unknown): Promise<T | undefined>;
	pasteToEditor(text: string): void;
	setEditorText(text: string): void;
	getEditorText(): string;
	editor(options?: unknown): Promise<string | undefined>;
	addAutocompleteProvider(factory: unknown): void;
	setEditorComponent(factory: unknown): void;
	getEditorComponent(): unknown;
	readonly theme: unknown;
	getAllThemes(): unknown[];
	getTheme(name: string): unknown;
	setTheme(theme: unknown): { success: boolean; error?: string };
	getToolsExpanded(): boolean;
	setToolsExpanded(expanded: boolean): void;
}

export interface ExtensionContext {
	ui: ExtensionUIContext;
	mode: ExtensionMode;
	hasUI: boolean;
	cwd: string;
	sessionManager: unknown;
	modelRegistry: unknown;
	model: Model<Api> | undefined;
	scopedModels: readonly unknown[];
	thinkingLevel?: string;
	isIdle(): boolean;
	isProjectTrusted(): boolean;
	signal: AbortSignal | undefined;
	abort(): void;
	hasPendingMessages(): boolean;
	shutdown(): void;
	getContextUsage(): unknown;
	compact(options?: unknown): void;
	getSystemPrompt(): string;
}

export interface ToolDefinition<TParams extends TSchema = TSchema, TDetails = unknown> {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: TParams;
	constrainedSampling?: false | unknown;
	prepareArguments?: (args: unknown) => Static<TParams>;
	executionMode?: ToolExecutionMode;
	execute(
		toolCallId: string,
		params: Static<TParams>,
		signal: AbortSignal | undefined,
		onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
		ctx: ExtensionContext,
	): Promise<AgentToolResult<TDetails>>;
	renderCall?: (...args: unknown[]) => unknown;
	renderResult?: (...args: unknown[]) => unknown;
}

export interface ProviderModelConfig {
	id: string;
	name: string;
	api?: Api;
	baseUrl?: string;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: Model<Api>["cost"];
	contextWindow: number;
	maxTokens: number;
	headers?: Record<string, string>;
	compat?: Model<Api>["compat"];
}

export interface ProviderConfig {
	name?: string;
	baseUrl?: string;
	apiKey?: string;
	api?: Api;
	headers?: Record<string, string>;
	authHeader?: boolean;
	models?: ProviderModelConfig[];
	streamSimple?: Provider["streamSimple"];
	oauth?: unknown;
	refreshModels?: unknown;
}

export interface RegisteredCommand {
	name: string;
	description?: string;
	handler: (args: string, ctx: ExtensionContext) => Promise<void> | void;
}

export type ExtensionFactory = (pi: ExtensionAPI) => void | Promise<void>;

export interface ExtensionAPI {
	on(event: string, handler: (...args: unknown[]) => unknown): void;
	registerTool<TParams extends TSchema = TSchema, TDetails = unknown>(tool: ToolDefinition<TParams, TDetails>): void;
	registerCommand(name: string, options: Omit<RegisteredCommand, "name">): void;
	registerShortcut(shortcut: string, options: { description?: string; handler: (ctx: ExtensionContext) => unknown }): void;
	registerFlag(name: string, options: { description?: string; type: "boolean" | "string"; default?: boolean | string }): void;
	getFlag(name: string): boolean | string | undefined;
	registerMessageRenderer(customType: string, renderer: unknown): void;
	registerMarkdownTransformer(transformer: unknown): void;
	registerEntryRenderer(customType: string, renderer: unknown): void;
	sendMessage(message: unknown, options?: unknown): void;
	sendUserMessage(content: unknown, options?: unknown): void;
	appendEntry(customType: string, data?: unknown): void;
	setSessionName(name: string): void;
	getSessionName(): string | undefined;
	setLabel(entryId: string, label: string | undefined): void;
	exec(command: string, args: string[], options?: { cwd?: string }): Promise<{ code: number | null; stdout: string; stderr: string }>;
	getActiveTools(): string[];
	getAllTools(): unknown[];
	setActiveTools(toolNames: string[]): void;
	getCommands(): unknown[];
	setModel(model: Model<Api>): Promise<boolean>;
	getThinkingLevel(): string;
	setThinkingLevel(level: string): void;
	registerProvider(provider: Provider): void;
	registerProvider(name: string, config: ProviderConfig): void;
	unregisterProvider(name: string): void;
	events: {
		emit(channel: string, data?: unknown): void;
		on(channel: string, handler: (data: unknown) => void): () => void;
	};
	ui: ExtensionUIContext;
}

export function defineTool<TParams extends TSchema, TDetails = unknown>(
	tool: ToolDefinition<TParams, TDetails>,
): ToolDefinition<TParams, TDetails> {
	return tool;
}

export const noOpUI: ExtensionUIContext = {
	select: async () => undefined,
	confirm: async () => false,
	input: async () => undefined,
	notify: () => {},
	onTerminalInput: () => () => {},
	setStatus: () => {},
	setWorkingMessage: () => {},
	setWorkingVisible: () => {},
	setWorkingIndicator: () => {},
	setHiddenThinkingLabel: () => {},
	setWidget: () => {},
	setFooter: () => {},
	setHeader: () => {},
	setTitle: () => {},
	custom: async () => undefined,
	pasteToEditor: () => {},
	setEditorText: () => {},
	getEditorText: () => "",
	editor: async () => undefined,
	addAutocompleteProvider: () => {},
	setEditorComponent: () => {},
	getEditorComponent: () => undefined,
	theme: undefined,
	getAllThemes: () => [],
	getTheme: () => undefined,
	setTheme: () => ({ success: false, error: "UI not available" }),
	getToolsExpanded: () => false,
	setToolsExpanded: () => {},
};

export function createPrintContext(cwd: string, signal?: AbortSignal): ExtensionContext {
	return {
		ui: noOpUI,
		mode: "print",
		hasUI: false,
		cwd,
		sessionManager: unavailable("sessionManager"),
		modelRegistry: unavailable("modelRegistry"),
		model: undefined,
		scopedModels: [],
		isIdle: () => true,
		isProjectTrusted: () => false,
		signal,
		abort() {},
		hasPendingMessages: () => false,
		shutdown() {},
		getContextUsage: () => undefined,
		compact() {},
		getSystemPrompt: () => "",
	};
}

function unavailable(label: string): unknown {
	return new Proxy(
		{},
		{
			get: (_target, prop) => {
				if (prop === "then") return undefined;
				return () => {
					throw new Error(`${label} is not available in piruse print mode`);
				};
			},
		},
	);
}
