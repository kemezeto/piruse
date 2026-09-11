import { basename, dirname } from "node:path";
import type { AgentHarness, AgentHarnessTool, ExecutionToolContext } from "@earendil-works/pi-agent-core";
import type { MutableModels, Provider } from "@earendil-works/pi-ai";
import type { ViewPackageItem, ViewPackageStatus } from "../../../protocol/src/view.ts";
import { resolveAgentDir } from "../models/paths.ts";
import type { InstalledResource } from "../packages/inventory.ts";
import { listInstalledResources } from "../packages/inventory.ts";
import type { Skill } from "../skills/index.ts";
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
	private inventorySkills: InstalledResource[] = [];
	private inventoryExtensions: InstalledResource[] = [];
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
			skills: this.inventorySkills.map(toViewItem),
			extensions: this.inventoryExtensions.map(toViewItem),
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
		const listed = await listInstalledResources({ cwd: options.cwd, agentDir });
		this.inventorySkills = listed.skills;
		this.inventoryExtensions = listed.extensions;
		this.skillsList = listed.skills.filter((skill) => skill.enabled).map(toSkill);

		for (const extension of listed.extensions.filter((item) => item.enabled)) {
			await this.loadOne(extension.path, options);
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
		this.inventorySkills = [];
		this.inventoryExtensions = [];
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

function toSkill(resource: InstalledResource): Skill {
	return {
		name: resource.name,
		description: resource.description ?? "",
		filePath: resource.path,
		baseDir: resource.baseDir,
		disableModelInvocation: resource.disableModelInvocation === true,
	};
}

function toViewItem(resource: InstalledResource): ViewPackageItem {
	return {
		id: resource.id,
		name: resource.name,
		description: resource.description,
		source: resource.source,
		path: resource.path,
		enabled: resource.enabled,
	};
}
