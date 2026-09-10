import {
	type Api,
	createProvider,
	envApiKeyAuth,
	type Model,
	type MutableModels,
	type Provider,
} from "@earendil-works/pi-ai";
import { getApiProvider } from "@earendil-works/pi-ai/compat";
import type { ModelsJsonFile, ModelsJsonModel, ModelsJsonProvider } from "./models-json.ts";

export function applyCustomCatalog(
	models: MutableModels,
	file: ModelsJsonFile,
	originals: Map<string, Provider>,
): void {
	for (const [id, config] of Object.entries(file.providers)) {
		const existing = models.getProvider(id);
		if (!originals.has(id) && existing) originals.set(id, existing);
		const base = originals.get(id);
		if (base) models.setProvider(overlayProvider(base, id, config));
		else models.setProvider(createCustomProvider(id, config));
	}
}

function overlayProvider(base: Provider, providerId: string, config: ModelsJsonProvider): Provider {
	const extras = (config.models ?? []).map((definition) =>
		modelFromDefinition(providerId, definition, config, base),
	);
	const extraIds = new Set(extras.map((model) => model.id));
	return {
		...base,
		name: config.name ?? base.name,
		baseUrl: config.baseUrl ?? base.baseUrl,
		getModels: () => {
			const current = base.getModels().filter((model) => !extraIds.has(model.id));
			return [...current, ...extras];
		},
		stream: (model, context, options) => {
			if (base.getModels().some((entry) => entry.id === model.id && entry.api === model.api)) {
				return base.stream(model, context, options);
			}
			const impl = getApiProvider(model.api);
			if (!impl) throw new Error(`No API registered for ${model.api}`);
			return impl.stream(model, context, options);
		},
		streamSimple: (model, context, options) => {
			if (base.getModels().some((entry) => entry.id === model.id && entry.api === model.api)) {
				return base.streamSimple(model, context, options);
			}
			const impl = getApiProvider(model.api);
			if (!impl) throw new Error(`No API registered for ${model.api}`);
			return impl.streamSimple(model, context, options);
		},
	};
}

function createCustomProvider(id: string, config: ModelsJsonProvider): Provider {
	const api = (config.api ?? "openai-completions") as Api;
	const impl = getApiProvider(api);
	if (!impl) throw new Error(`Unsupported API "${api}"`);
	const baseUrl = config.baseUrl;
	if (!baseUrl) throw new Error(`Provider ${id}: baseUrl is required`);
	const catalog = (config.models ?? []).map((definition) => modelFromDefinition(id, definition, config, undefined));
	return createProvider({
		id,
		name: config.name ?? id,
		baseUrl,
		auth: { apiKey: envApiKeyAuth(`${config.name ?? id} API key`, []) },
		models: catalog,
		api: { stream: impl.stream, streamSimple: impl.streamSimple },
	});
}

function modelFromDefinition(
	providerId: string,
	definition: ModelsJsonModel,
	config: ModelsJsonProvider,
	base: Provider | undefined,
): Model<Api> {
	const template = base?.getModels().find((model) => model.id === definition.id) ?? base?.getModels()[0];
	const api = (definition.api ?? config.api ?? template?.api) as Api | undefined;
	if (!api) throw new Error(`Provider ${providerId}, model ${definition.id}: set api on the provider or model`);
	const baseUrl = definition.baseUrl ?? config.baseUrl ?? template?.baseUrl;
	if (!baseUrl) throw new Error(`Provider ${providerId}: baseUrl is required when adding "${definition.id}"`);
	return {
		id: definition.id,
		name: definition.name ?? definition.id,
		api,
		provider: providerId,
		baseUrl,
		reasoning: definition.reasoning ?? template?.reasoning ?? false,
		input: template?.input ?? ["text"],
		cost: template?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: definition.contextWindow ?? template?.contextWindow ?? 128_000,
		maxTokens: definition.maxTokens ?? template?.maxTokens ?? 16_384,
		compat: template?.compat,
	};
}
