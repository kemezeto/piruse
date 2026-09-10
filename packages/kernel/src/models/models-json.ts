import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ModelsJsonModel {
	id: string;
	name?: string;
	api?: string;
	baseUrl?: string;
	reasoning?: boolean;
	contextWindow?: number;
	maxTokens?: number;
}

export interface ModelsJsonProvider {
	name?: string;
	baseUrl?: string;
	api?: string;
	models?: ModelsJsonModel[];
}

export interface ModelsJsonFile {
	providers: Record<string, ModelsJsonProvider>;
}

export async function loadModelsJson(path: string): Promise<ModelsJsonFile> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { providers: {} };
		const record = parsed as Record<string, unknown>;
		const raw = record.providers;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { providers: {} };
		const providers: Record<string, ModelsJsonProvider> = {};
		for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
			const provider = asProvider(value);
			if (provider) providers[id] = provider;
		}
		return { providers };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { providers: {} };
		throw error;
	}
}

export async function saveModelsJson(path: string, file: ModelsJsonFile): Promise<void> {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function asProvider(value: unknown): ModelsJsonProvider | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const models = Array.isArray(record.models)
		? record.models
				.map(asModel)
				.filter((model): model is ModelsJsonModel => model !== undefined)
		: undefined;
	return {
		name: typeof record.name === "string" ? record.name : undefined,
		baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
		api: typeof record.api === "string" ? record.api : undefined,
		models,
	};
}

function asModel(value: unknown): ModelsJsonModel | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (typeof record.id !== "string" || !record.id.trim()) return undefined;
	return {
		id: record.id.trim(),
		name: typeof record.name === "string" ? record.name : undefined,
		api: typeof record.api === "string" ? record.api : undefined,
		baseUrl: typeof record.baseUrl === "string" ? record.baseUrl : undefined,
		reasoning: typeof record.reasoning === "boolean" ? record.reasoning : undefined,
		contextWindow: typeof record.contextWindow === "number" ? record.contextWindow : undefined,
		maxTokens: typeof record.maxTokens === "number" ? record.maxTokens : undefined,
	};
}
