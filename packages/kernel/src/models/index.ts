/**
 * Load pi's model catalog and credentials (~/.pi/agent/auth.json + settings.json).
 */

import { readFile } from "node:fs/promises";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { type Api, type Model, type MutableModels, type Provider } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { ViewModelOption, ViewProviderChoice, ViewProviderOption } from "../../../protocol/src/view.ts";
import { applyCustomCatalog } from "./apply-custom.ts";
import { FileCredentialStore } from "./auth-store.ts";
import { loadModelsJson, type ModelsJsonFile } from "./models-json.ts";
import { agentPaths, resolveAgentDir, type AgentPaths } from "./paths.ts";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export interface AgentSettings {
	defaultProvider?: string;
	defaultModel?: string;
	defaultThinkingLevel?: ThinkingLevel;
}

export interface ModelSelection {
	models: MutableModels;
	model: Model<Api>;
	thinkingLevel: ThinkingLevel;
	authSource: string | undefined;
	paths: AgentPaths;
	credentials: FileCredentialStore;
	originals: Map<string, Provider>;
}

export interface ResolveModelOptions {
	agentDir?: string;
	provider?: string;
	model?: string;
}

function asThinkingLevel(value: unknown): ThinkingLevel | undefined {
	return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value)
		? (value as ThinkingLevel)
		: undefined;
}

export async function loadAgentSettings(path: string): Promise<AgentSettings> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const record = parsed as Record<string, unknown>;
		return {
			defaultProvider: typeof record.defaultProvider === "string" ? record.defaultProvider : undefined,
			defaultModel: typeof record.defaultModel === "string" ? record.defaultModel : undefined,
			defaultThinkingLevel: asThinkingLevel(record.defaultThinkingLevel),
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw error;
	}
}

function modelKey(model: Model<Api>): string {
	return `${model.provider}/${model.id}`;
}

function knownProvider(catalog: readonly Model<Api>[], provider: string): string | undefined {
	const needle = provider.toLowerCase();
	return catalog.find((model) => model.provider.toLowerCase() === needle)?.provider;
}

function findExact(catalog: readonly Model<Api>[], provider: string | undefined, id: string): Model<Api>[] {
	const needle = id.toLowerCase();
	const providerId = provider ? knownProvider(catalog, provider) : undefined;
	return catalog.filter((model) => {
		if (providerId && model.provider !== providerId) return false;
		return model.id.toLowerCase() === needle || modelKey(model).toLowerCase() === needle;
	});
}

function resolveRequested(catalog: readonly Model<Api>[], provider: string | undefined, modelRef: string): Model<Api> {
	if (provider && !knownProvider(catalog, provider)) {
		throw new Error(`Unknown provider "${provider}".`);
	}
	let providerId = provider;
	let id = modelRef;
	if (!providerId) {
		const slash = modelRef.indexOf("/");
		if (slash > 0) {
			const prefix = modelRef.slice(0, slash);
			if (knownProvider(catalog, prefix)) {
				providerId = prefix;
				id = modelRef.slice(slash + 1);
			}
		}
	} else if (modelRef.toLowerCase().startsWith(`${providerId.toLowerCase()}/`)) {
		id = modelRef.slice(providerId.length + 1);
	}

	const matches = findExact(catalog, providerId, id);
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		const names = matches.map(modelKey).join(", ");
		throw new Error(`Model "${modelRef}" is ambiguous: ${names}. Pass --provider or provider/model.`);
	}
	const display = providerId ? `${knownProvider(catalog, providerId) ?? providerId}/${id}` : modelRef;
	throw new Error(`Unknown model "${display}".`);
}

async function firstAvailable(models: MutableModels, preferred: Model<Api> | undefined): Promise<Model<Api> | undefined> {
	if (preferred && (await models.checkAuth(preferred.provider))) return preferred;
	const available = await models.getAvailable();
	return available[0];
}

export async function resolveConfiguredModel(options: ResolveModelOptions = {}): Promise<ModelSelection> {
	const paths = agentPaths(resolveAgentDir(options.agentDir));
	const credentials = FileCredentialStore.create(paths.auth);
	const models = builtinModels({ credentials });
	const originals = new Map<string, Provider>();
	const custom = await loadModelsJson(paths.models);
	applyCustomCatalog(models, custom, originals);
	const settings = await loadAgentSettings(paths.settings);
	const catalog = models.getModels();

	let selected: Model<Api> | undefined;
	if (options.model) {
		selected = resolveRequested(catalog, options.provider, options.model);
	} else if (options.provider) {
		throw new Error(`--provider ${options.provider} requires --model`);
	} else {
		const preferred =
			settings.defaultProvider && settings.defaultModel
				? models.getModel(settings.defaultProvider, settings.defaultModel)
				: undefined;
		selected = (await firstAvailable(models, preferred)) ?? preferred;
	}
	if (!selected) {
		throw new Error(
			`No model is configured. Add a key in ${paths.auth} (same file as pi), set a provider env var, or pass --model.`,
		);
	}

	const auth = await models.getAuth(selected.provider).catch(() => undefined);
	if (!auth) {
		console.error(
			`Warning: ${selected.provider} has no stored credential or env key. Prompts will fail until ${paths.auth} or a provider env var is set.`,
		);
	}

	return {
		models,
		model: selected,
		thinkingLevel: settings.defaultThinkingLevel ?? "off",
		authSource: auth?.source,
		paths,
		credentials,
		originals,
	};
}

export function toViewModel(model: Model<Api>): ViewModelOption {
	return { provider: model.provider, modelId: model.id, name: model.name };
}

export async function listAvailableModels(
	models: MutableModels,
	current?: { provider: string; id: string },
): Promise<ViewModelOption[]> {
	const available = [...(await models.getAvailable())];
	if (current) {
		const selected = models.getModel(current.provider, current.id);
		if (selected && !available.some((model) => model.provider === selected.provider && model.id === selected.id)) {
			available.unshift(selected);
		}
	}
	return available
		.map(toViewModel)
		.sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name));
}

export async function listProviderCatalog(
	models: MutableModels,
	file: ModelsJsonFile,
	originals: Map<string, Provider>,
): Promise<{ providers: ViewProviderOption[]; choices: ViewProviderChoice[] }> {
	const customIds = new Set(Object.keys(file.providers));
	const choices: ViewProviderChoice[] = models
		.getProviders()
		.map((provider) => ({ id: provider.id, name: provider.name }))
		.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

	const providers: ViewProviderOption[] = [];
	for (const provider of models.getProviders()) {
		const overlay = file.providers[provider.id];
		const auth = await models.checkAuth(provider.id);
		if (!auth && !overlay) continue;
		const overlayIds = new Set((overlay?.models ?? []).map((model) => model.id));
		providers.push({
			id: provider.id,
			name: provider.name,
			baseUrl: overlay?.baseUrl ?? provider.baseUrl,
			api: overlay?.api,
			authenticated: Boolean(auth),
			custom: customIds.has(provider.id) && !originals.has(provider.id),
			models: provider.getModels().map((model) => ({
				id: model.id,
				name: model.name,
				custom: overlayIds.has(model.id),
			})),
		});
	}
	providers.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
	return { providers, choices };
}
