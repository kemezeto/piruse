import { basename, dirname } from "node:path";
import type { AgentHarness, AgentHarnessTool, ExecutionToolContext } from "@earendil-works/pi-agent-core";
import type { MutableModels, Provider } from "@earendil-works/pi-ai";
import type { ViewPackageStatus } from "../../../protocol/src/view.ts";
import { resolveAgentDir } from "../models/paths.ts";
import { loadUserSkills, type Skill } from "../skills/index.ts";
import { discoverUserExtensions } from "./discover.ts";
import {
	createExtensionHost,
	installExtensionHooks,
	type LoadedExtension,
	type PackageDiagnostic,
	runExtensionFactory,
	wrapExtensionTool,
} from "./host.ts";
import { importExtensionFactory } from "./loader.ts";

export interface PackageHostOptions {
	cwd: string;
	agentDir?: string;
	models: MutableModels;
}

export class PackageHost {
	private skillsList: Skill[] = [];
	private loaded: LoadedExtension[] = [];
	private diagnostics: PackageDiagnostic[] = [];
	private wrappedTools: AgentHarnessTool<ExecutionToolContext>[] = [];
	private providerSnapshots = new Map<string, Provider | undefined>();
	private cwd = "";
	private models: MutableModels | undefined;

	skills(): Skill[] {
		return this.skillsList;
	}

	tools(): AgentHarnessTool<ExecutionToolContext>[] {
		return this.wrappedTools;
	}

	view(): ViewPackageStatus {
		return {
			skills: this.skillsList.map((skill) => skill.name),
			extensions: this.loaded.map((extension) => extension.name),
			diagnostics: this.diagnostics.map((item) => ({
				level: item.level,
				message: item.path ? `${item.message} (${item.path})` : item.message,
			})),
			unsupported: [...new Set(this.loaded.flatMap((extension) => extension.unsupported))],
		};
	}

	async load(options: PackageHostOptions): Promise<void> {
		this.unload();
		this.cwd = options.cwd;
		this.models = options.models;
		const agentDir = resolveAgentDir(options.agentDir);
		const skillResult = await loadUserSkills({ cwd: options.cwd, agentDir });
		this.skillsList = skillResult.skills;
		this.diagnostics.push(...skillResult.diagnostics);

		const paths = await discoverUserExtensions({ cwd: options.cwd, agentDir });
		for (const path of paths) {
			await this.loadOne(path, options);
		}
		this.wrappedTools = this.loaded.flatMap((extension) =>
			extension.tools.map((tool) => wrapExtensionTool(tool, options.cwd)),
		);
	}

	unload(): void {
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
		this.skillsList = [];
		this.loaded = [];
		this.diagnostics = [];
		this.wrappedTools = [];
		this.providerSnapshots.clear();
	}

	installHooks(harness: AgentHarness): void {
		installExtensionHooks(harness, this.loaded, this.cwd);
	}

	private async loadOne(path: string, options: PackageHostOptions): Promise<void> {
		const host = createExtensionHost({
			cwd: options.cwd,
			models: options.models,
			diagnostics: this.diagnostics,
			providerSnapshots: this.providerSnapshots,
		});
		host.record.path = path;
		host.record.name = extensionName(path);
		try {
			const factory = await importExtensionFactory(path);
			await runExtensionFactory(factory, host.api);
			host.commitProviders();
			this.loaded.push(host.record);
		} catch (error) {
			this.diagnostics.push({
				level: "error",
				message: error instanceof Error ? error.message : String(error),
				path,
			});
		}
	}
}

function extensionName(path: string): string {
	const base = basename(path);
	if (base === "index.ts" || base === "index.js") return basename(dirname(path)) || base;
	return base.replace(/\.(ts|js)$/, "");
}
