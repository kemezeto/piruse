import { basename, dirname } from "node:path";
import type { AgentHarness, AgentHarnessTool, ExecutionToolContext } from "../runtime/index.ts";
import type { MutableModels, Provider } from "@earendil-works/pi-ai";
import {
	installPiruseChildSessionFactory,
	isPiSubagentsPath,
	resetPiruseChildSessionFactory,
} from "./child-session.ts";
import {
	createExtensionHost,
	installExtensionHooks,
	type LoadedExtension,
	type PackageDiagnostic,
	runExtensionFactory,
	wrapExtensionTool,
} from "./host.ts";
import { importExtensionFactory } from "./loader.ts";
import type { ExtensionRuntime } from "./runtime.ts";

export type { PackageDiagnostic };

export interface ExtensionHostOptions {
	cwd: string;
	models: MutableModels;
	paths: string[];
}

/** Load enabled Pi extensions. Skills stay in `skills/`; inventory stays in `packages/`. */
export class ExtensionHost {
	private loaded: LoadedExtension[] = [];
	private diagnosticList: PackageDiagnostic[] = [];
	private wrappedTools: AgentHarnessTool<ExecutionToolContext>[] = [];
	private providerSnapshots = new Map<string, Provider | undefined>();
	private cwd = "";
	private models: MutableModels | undefined;
	private runtime: ExtensionRuntime | undefined;
	private childFactory: { dispose(): Promise<void> } | undefined;

	tools(): AgentHarnessTool<ExecutionToolContext>[] {
		return this.wrappedTools;
	}

	diagnostics(): PackageDiagnostic[] {
		return this.diagnosticList;
	}

	unsupported(): string[] {
		return [...new Set(this.loaded.flatMap((extension) => extension.unsupported))];
	}

	async load(options: ExtensionHostOptions): Promise<void> {
		this.unload();
		this.cwd = options.cwd;
		this.models = options.models;
		for (const path of options.paths) {
			await this.loadOne(path, options);
		}
		this.wrappedTools = this.loaded.flatMap((extension) =>
			extension.tools.map((tool) => wrapExtensionTool(tool, options.cwd, () => this.runtime)),
		);
	}

	bindRuntime(runtime: ExtensionRuntime): void {
		this.runtime = runtime;
	}

	unload(): void {
		const factory = this.childFactory;
		this.childFactory = undefined;
		void factory?.dispose();
		for (const extension of this.loaded) {
			if (isPiSubagentsPath(extension.path)) void resetPiruseChildSessionFactory(extension.path);
		}
		this.runtime = undefined;
		if (this.models) {
			for (const [id, previous] of this.providerSnapshots) {
				try {
					if (previous) this.models.setProvider(previous);
					else this.models.deleteProvider(id);
				} catch {
					// provider may already be gone
				}
			}
		}
		this.loaded = [];
		this.diagnosticList = [];
		this.wrappedTools = [];
		this.providerSnapshots.clear();
	}

	installHooks(harness: AgentHarness): void {
		installExtensionHooks(harness, this.loaded, this.cwd, () => this.runtime);
	}

	private async loadOne(path: string, options: ExtensionHostOptions): Promise<void> {
		const host = createExtensionHost({
			cwd: options.cwd,
			models: options.models,
			diagnostics: this.diagnosticList,
			providerSnapshots: this.providerSnapshots,
			runtime: () => this.runtime,
		});
		host.record.path = path;
		host.record.name = extensionName(path);
		try {
			const factory = await importExtensionFactory(path);
			await runExtensionFactory(factory, host.api);
			if (isPiSubagentsPath(path)) forceForegroundSubagent(host.record.tools);
			host.commitProviders();
			this.loaded.push(host.record);
			if (isPiSubagentsPath(path)) {
				this.childFactory = await installPiruseChildSessionFactory(path, () => this.runtime);
			}
		} catch (error) {
			this.diagnosticList.push({
				level: "error",
				message: error instanceof Error ? error.message : String(error),
				path,
			});
		}
	}
}

function forceForegroundSubagent(tools: LoadedExtension["tools"]): void {
	for (const tool of tools) {
		if (tool.name !== "subagent") continue;
		const execute = tool.execute.bind(tool);
		tool.execute = (toolCallId, params, signal, onUpdate, ctx) => {
			const next =
				params && typeof params === "object"
					? { ...(params as Record<string, unknown>), async: false }
					: { async: false };
			return execute(toolCallId, next as typeof params, signal, onUpdate, ctx);
		};
	}
}

function extensionName(path: string): string {
	const base = basename(path);
	if (base === "index.ts" || base === "index.js") return basename(dirname(path)) || base;
	return base.replace(/\.(ts|js)$/, "");
}
