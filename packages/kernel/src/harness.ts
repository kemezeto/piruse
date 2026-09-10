import {
	AgentHarness,
	type AgentLane,
	BACKGROUND_CONTEXT,
	type Context,
	type JsonlSessionMetadata,
	JsonlSessionRepo,
	type OpenOperation,
	type Session,
	type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { MutableModels, Provider } from "@earendil-works/pi-ai";
import type {
	ViewArchivedSession,
	ViewModelOption,
	ViewProjectOption,
	ViewProviderChoice,
	ViewProviderOption,
	ViewSessionOption,
} from "../../protocol/src/view.ts";
import { compactionSettings } from "./compaction/settings.ts";
import { userText } from "./messages.ts";
import { FileCredentialStore } from "./models/auth-store.ts";
import { applyCustomCatalog } from "./models/apply-custom.ts";
import { listAvailableModels, listProviderCatalog, resolveConfiguredModel } from "./models/index.ts";
import { loadModelsJson, saveModelsJson, type ModelsJsonModel } from "./models/models-json.ts";
import type { AgentPaths } from "./models/paths.ts";
import { isArchived, readArchiveIndex, writeArchiveIndex } from "./session/archive.ts";
import { openFirstReadable, openInitialSession, shortId } from "./session/open.ts";
import { readPermissionMode } from "./session/permissions.ts";
import {
	discoverTitleFromJsonl,
	displayTitle,
	readTitleIndex,
	titleFromPrompt,
	writeTitleIndex,
} from "./session/titles.ts";
import {
	projectName,
	projectsFromSessions,
	resolveProjectDirectory,
	writeLastProject,
} from "./session/projects.ts";
import { resolveProfile, type AgentProfile, type AgentProfileId } from "./profile/index.ts";
import { isPermissionMode, type PermissionMode } from "./tools/policy.ts";
import { installPermissionHooks, PermissionGate } from "./hooks.ts";
import type { ViewApproval } from "../../protocol/src/view.ts";

export interface BootOptions {
	cwd: string;
	sessionsRoot: string;
	sessionId?: string;
	continueSession?: boolean;
	resumeLatest?: boolean;
	provider?: string;
	model?: string;
	agentDir?: string;
	profileId?: AgentProfileId;
	permissionMode?: PermissionMode;
	interactiveApprovals?: boolean;
}

export interface BootedHarness {
	context: Context;
	session: Session<JsonlSessionMetadata>;
	harness: AgentHarness;
	lane: AgentLane;
	open: OpenOperation[];
	model: { provider: string; id: string };
	authSource: string | undefined;
	resumeOpen(): Promise<void>;
	close(): Promise<void>;
	listModels(): Promise<ViewModelOption[]>;
	listCatalog(): Promise<{ providers: ViewProviderOption[]; choices: ViewProviderChoice[] }>;
	listSessions(): Promise<ViewSessionOption[]>;
	listArchivedSessions(): Promise<ViewArchivedSession[]>;
	listProjects(): Promise<ViewProjectOption[]>;
	sessionTitle(): Promise<string>;
	setSessionTitle(sessionId: string | undefined, title: string): Promise<void>;
	rememberTitleFromPrompt(text: string): Promise<void>;
	setModel(provider: string, modelId: string): Promise<void>;
	openSession(sessionId: string): Promise<void>;
	newSession(): Promise<void>;
	openProject(cwd: string): Promise<void>;
	archiveSession(sessionId?: string): Promise<void>;
	unarchiveSession(sessionId: string): Promise<void>;
	deleteArchivedSession(sessionId: string): Promise<void>;
	setPermissionMode(mode: PermissionMode): Promise<void>;
	resolveApproval(id: string, allow: boolean): void;
	rejectApprovals(): void;
	onPermissionChange(listener: () => void): () => void;
	permissionMode(): PermissionMode;
	pendingApprovals(): ViewApproval[];
	addProvider(input: { id: string; name?: string; baseUrl: string; api: string; apiKey: string }): Promise<void>;
	addModel(input: {
		provider: string;
		modelId: string;
		name?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}): Promise<void>;
	setProviderKey(provider: string, apiKey: string): Promise<void>;
	isRunning(): Promise<boolean>;
}

export class Operator implements BootedHarness {
	cwd: string;
	session: Session<JsonlSessionMetadata>;
	harness: AgentHarness;
	lane: AgentLane;
	open: OpenOperation[];
	model: { provider: string; id: string };

	private constructor(
		readonly context: Context,
		cwd: string,
		readonly models: MutableModels,
		readonly thinkingLevel: ThinkingLevel,
		readonly authSource: string | undefined,
		private readonly repo: JsonlSessionRepo,
		private readonly sessionsRoot: string,
		private readonly executionEnv: NodeExecutionEnv,
		private readonly credentials: FileCredentialStore,
		private readonly paths: AgentPaths,
		private readonly originals: Map<string, Provider>,
		private readonly permissions: PermissionGate,
		readonly profile: AgentProfile,
		bound: {
			session: Session<JsonlSessionMetadata>;
			harness: AgentHarness;
			lane: AgentLane;
			open: OpenOperation[];
			model: { provider: string; id: string };
		},
	) {
		this.cwd = cwd;
		this.session = bound.session;
		this.harness = bound.harness;
		this.lane = bound.lane;
		this.open = bound.open;
		this.model = bound.model;
	}

	static async boot(options: BootOptions): Promise<Operator> {
		const context = BACKGROUND_CONTEXT;
		const configured = await resolveConfiguredModel({
			agentDir: options.agentDir,
			provider: options.provider,
			model: options.model,
		});
		const executionEnv = new NodeExecutionEnv({ cwd: options.cwd });
		const bootCwd = await resolveProjectDirectory(executionEnv, options.cwd, context);
		executionEnv.cwd = bootCwd;
		const repo = new JsonlSessionRepo({ fileSystem: executionEnv, sessionsRoot: options.sessionsRoot });
		const archived = await readArchiveIndex(options.sessionsRoot);
		const session = await openInitialSession(
			repo,
			{ ...options, cwd: bootCwd, usable: (id) => !isArchived(archived, id) },
			context,
		);
		const cwd = session.metadata.cwd;
		executionEnv.cwd = cwd;
		const profile = resolveProfile(options.profileId);
		const interactive = options.interactiveApprovals === true;
		const stored = interactive ? await readPermissionMode(options.sessionsRoot, cwd) : undefined;
		const mode = options.permissionMode ?? stored ?? (interactive ? profile.permissionDefault : "allow");
		const gate = new PermissionGate(
			options.sessionsRoot,
			cwd,
			interactive,
			mode,
			() => profile.tools().map((tool) => tool.name),
			profile.permissionDefault,
		);
		const bound = await Operator.bindSession(
			context,
			cwd,
			configured.models,
			configured.model,
			configured.thinkingLevel,
			executionEnv,
			session,
			gate,
			profile,
		);
		const operator = new Operator(
			context,
			cwd,
			configured.models,
			configured.thinkingLevel,
			configured.authSource,
			repo,
			options.sessionsRoot,
			executionEnv,
			configured.credentials,
			configured.paths,
			configured.originals,
			gate,
			profile,
			bound,
		);
		await operator.ensureTitle();
		return operator;
	}

	private static async bindSession(
		context: Context,
		cwd: string,
		models: MutableModels,
		model: { provider: string; id: string },
		thinkingLevel: ThinkingLevel,
		executionEnv: NodeExecutionEnv,
		session: Session<JsonlSessionMetadata>,
		permissions: PermissionGate,
		profile: AgentProfile,
	): Promise<{
		session: Session<JsonlSessionMetadata>;
		harness: AgentHarness;
		lane: AgentLane;
		open: OpenOperation[];
		model: { provider: string; id: string };
	}> {
		const catalogModel = models.getModel(model.provider, model.id);
		if (!catalogModel) throw new Error(`Unknown model ${model.provider}/${model.id}`);
		const { harness, open } = await AgentHarness.create(
			{
				session,
				models,
				model: catalogModel,
				thinkingLevel,
				tools: profile.tools(),
				toolContext: { env: executionEnv },
				systemPrompt: profile.systemPrompt(cwd),
				compaction: compactionSettings,
			},
			context,
		);
		installPermissionHooks(harness, permissions);
		const lane = await harness.lane("main", context);
		await permissions.applyTools(lane, context);
		const live = await lane.getModel(context);
		return {
			session,
			harness,
			lane,
			open,
			model: live ? { provider: live.provider, id: live.id } : { provider: model.provider, id: model.id },
		};
	}

	async listModels(): Promise<ViewModelOption[]> {
		return listAvailableModels(this.models, this.model);
	}

	async listCatalog(): Promise<{ providers: ViewProviderOption[]; choices: ViewProviderChoice[] }> {
		return listProviderCatalog(this.models, await loadModelsJson(this.paths.models), this.originals);
	}

	async listSessions(): Promise<ViewSessionOption[]> {
		const listed = await this.liveSessions({ cwd: this.cwd });
		listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
		const page = listed.slice(0, 80);
		const titles = await this.titlesFor(page);
		const currentName = await this.sessionTitle();
		return page.map((entry) => ({
			id: entry.id,
			title: entry.id === this.session.metadata.id ? currentName : (titles.get(entry.id) ?? shortId(entry.id)),
			modifiedAt: entry.modifiedAt,
		}));
	}

	async listArchivedSessions(): Promise<ViewArchivedSession[]> {
		const index = await readArchiveIndex(this.sessionsRoot);
		const listed = await this.repo.list(undefined, this.context);
		const byId = new Map(listed.map((entry) => [entry.id, entry]));
		const titles = await this.titlesFor(
			Object.keys(index).map((id) => ({ id, path: byId.get(id)?.path })),
		);
		return Object.entries(index)
			.map(([id, record]) => {
				const metadata = byId.get(id);
				return {
					id,
					title: displayTitle(id, titles.get(id), record.title),
					cwd: record.cwd,
					projectName: projectName(record.cwd),
					modifiedAt: metadata?.modifiedAt ?? record.archivedAt,
					archivedAt: record.archivedAt,
				};
			})
			.sort((left, right) => right.archivedAt - left.archivedAt);
	}

	async listProjects(): Promise<ViewProjectOption[]> {
		const listed = await this.liveSessions();
		listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
		const titles = await this.titlesFor(listed);
		const currentName = await this.sessionTitle();
		const currentId = this.session.metadata.id;
		const grouped = new Map<string, typeof listed>();
		for (const entry of listed) {
			const bucket = grouped.get(entry.cwd) ?? [];
			if (bucket.length < 80) bucket.push(entry);
			grouped.set(entry.cwd, bucket);
		}
		return projectsFromSessions(listed, this.cwd).map((project) => ({
			...project,
			sessions: (grouped.get(project.cwd) ?? []).map((entry) => ({
				id: entry.id,
				title: entry.id === currentId ? currentName : (titles.get(entry.id) ?? shortId(entry.id)),
				modifiedAt: entry.modifiedAt,
			})),
		}));
	}

	async sessionTitle(): Promise<string> {
		const id = this.session.metadata.id;
		const named = (await this.harness.getName(this.context).catch(() => undefined))?.trim();
		const cached = (await readTitleIndex(this.sessionsRoot))[id];
		return displayTitle(id, named, cached);
	}

	async setSessionTitle(sessionId: string | undefined, title: string): Promise<void> {
		const id = sessionId?.trim() || this.session.metadata.id;
		const name = titleFromPrompt(title);
		if (!name) throw new Error("Title is required");
		const titles = await readTitleIndex(this.sessionsRoot);
		titles[id] = name;
		await writeTitleIndex(this.sessionsRoot, titles);
		if (id === this.session.metadata.id) {
			await this.harness.setName(name, this.context);
		}
		const archived = await readArchiveIndex(this.sessionsRoot);
		if (isArchived(archived, id)) {
			archived[id] = { ...archived[id], title: name };
			await writeArchiveIndex(this.sessionsRoot, archived);
		}
	}

	async rememberTitleFromPrompt(text: string): Promise<void> {
		const id = this.session.metadata.id;
		if ((await this.harness.getName(this.context).catch(() => undefined))?.trim()) return;
		if ((await readTitleIndex(this.sessionsRoot))[id]?.trim()) return;
		const name = titleFromPrompt(text);
		if (!name) return;
		await this.setSessionTitle(id, name);
	}

	async isRunning(): Promise<boolean> {
		const info = await this.lane.inspectExecution(this.context);
		return info.current !== null;
	}

	async setModel(provider: string, modelId: string): Promise<void> {
		const found = this.models.getModel(provider, modelId);
		if (!found) throw new Error(`Unknown model ${provider}/${modelId}`);
		const auth = await this.models.checkAuth(found.provider);
		if (!auth) throw new Error(`${found.provider} is not authenticated`);
		await this.lane.setModel({ provider: found.provider, modelId: found.id }, this.context);
		this.model = { provider: found.provider, id: found.id };
	}

	async openSession(sessionId: string): Promise<void> {
		if (sessionId === this.session.metadata.id) return;
		if (isArchived(await readArchiveIndex(this.sessionsRoot), sessionId)) {
			throw new Error(`Session is archived: ${sessionId}`);
		}
		const metadata =
			(await this.repo.list({ cwd: this.cwd }, this.context)).find((entry) => entry.id === sessionId) ??
			(await this.repo.list(undefined, this.context)).find((entry) => entry.id === sessionId);
		if (!metadata) throw new Error(`Unknown session: ${sessionId}`);
		await this.replaceSession(() => this.repo.open(metadata, this.context));
	}

	async newSession(): Promise<void> {
		await this.replaceSession(() => this.repo.create({ cwd: this.cwd }, this.context));
	}

	async openProject(cwdInput: string): Promise<void> {
		const cwd = await resolveProjectDirectory(this.executionEnv, cwdInput, this.context);
		if (cwd === this.cwd) return;
		await this.replaceSession(async () => {
			const listed = await this.liveSessions({ cwd });
			listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
			return (await openFirstReadable(this.repo, listed, this.context)) ?? this.repo.create({ cwd }, this.context);
		});
	}

	async archiveSession(sessionId?: string): Promise<void> {
		const id = sessionId?.trim() || this.session.metadata.id;
		const index = await readArchiveIndex(this.sessionsRoot);
		if (isArchived(index, id)) throw new Error(`Session is already archived: ${id}`);
		if (id === this.session.metadata.id) {
			if (await this.isRunning()) throw new Error("Stop the current run before archiving.");
			const title = displayTitle(
				id,
				await this.sessionTitle(),
				(await readTitleIndex(this.sessionsRoot))[id],
			);
			const cwd = this.cwd;
			await this.replaceSession(async () => {
				const listed = await this.liveSessions({ cwd });
				listed.sort((left, right) => right.modifiedAt - left.modifiedAt);
				const next = listed.filter((entry) => entry.id !== id);
				return (await openFirstReadable(this.repo, next, this.context)) ?? this.repo.create({ cwd }, this.context);
			});
			const nextIndex = await readArchiveIndex(this.sessionsRoot);
			nextIndex[id] = { archivedAt: Date.now(), title, cwd };
			await writeArchiveIndex(this.sessionsRoot, nextIndex);
			return;
		}
		const metadata = (await this.repo.list(undefined, this.context)).find((entry) => entry.id === id);
		if (!metadata) throw new Error(`Unknown session: ${id}`);
		const titles = await this.titlesFor([metadata]);
		index[id] = {
			archivedAt: Date.now(),
			title: titles.get(id) ?? shortId(id),
			cwd: metadata.cwd,
		};
		await writeArchiveIndex(this.sessionsRoot, index);
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const id = sessionId.trim();
		const index = await readArchiveIndex(this.sessionsRoot);
		if (!isArchived(index, id)) throw new Error(`Session is not archived: ${id}`);
		const metadata = (await this.repo.list(undefined, this.context)).find((entry) => entry.id === id);
		if (!metadata) throw new Error("Archived session file is missing. Delete it instead.");
		delete index[id];
		await writeArchiveIndex(this.sessionsRoot, index);
	}

	async deleteArchivedSession(sessionId: string): Promise<void> {
		const id = sessionId.trim();
		if (id === this.session.metadata.id) throw new Error("Cannot delete the open session.");
		const index = await readArchiveIndex(this.sessionsRoot);
		if (!isArchived(index, id)) throw new Error(`Session is not archived: ${id}`);
		const metadata = (await this.repo.list(undefined, this.context)).find((entry) => entry.id === id);
		if (metadata) await this.repo.delete(metadata, this.context);
		delete index[id];
		await writeArchiveIndex(this.sessionsRoot, index);
		const titles = await readTitleIndex(this.sessionsRoot);
		if (titles[id]) {
			delete titles[id];
			await writeTitleIndex(this.sessionsRoot, titles);
		}
	}

	permissionMode(): PermissionMode {
		return this.permissions.mode;
	}

	pendingApprovals(): ViewApproval[] {
		return this.permissions.viewApprovals();
	}

	onPermissionChange(listener: () => void): () => void {
		return this.permissions.onChange(listener);
	}

	async setPermissionMode(mode: PermissionMode): Promise<void> {
		if (!isPermissionMode(mode)) throw new Error(`Unknown permission mode: ${String(mode)}`);
		await this.permissions.setMode(mode, this.lane, this.context);
	}

	resolveApproval(id: string, allow: boolean): void {
		this.permissions.resolve(id, allow);
	}

	rejectApprovals(): void {
		this.permissions.rejectAll("Cancelled");
	}

	private async titlesFor(entries: Array<{ id: string; path?: string }>): Promise<Map<string, string>> {
		const stored = await readTitleIndex(this.sessionsRoot);
		const result = new Map<string, string>();
		let dirty = false;
		await Promise.all(
			entries.map(async (entry) => {
				const cached = stored[entry.id]?.trim();
				if (cached) {
					result.set(entry.id, cached);
					return;
				}
				const discovered = entry.path ? await discoverTitleFromJsonl(entry.path) : undefined;
				if (discovered) {
					stored[entry.id] = discovered;
					dirty = true;
					result.set(entry.id, discovered);
					return;
				}
				result.set(entry.id, shortId(entry.id));
			}),
		);
		if (dirty) await writeTitleIndex(this.sessionsRoot, stored);
		return result;
	}

	private async firstUserPrompt(): Promise<string | undefined> {
		const entries = await this.session.findEntries({ type: "message", order: "asc", limit: 40 }, this.context);
		for (const entry of entries) {
			if (entry.type !== "message" || entry.message.role !== "user") continue;
			const named = titleFromPrompt(userText(entry.message.content));
			if (named) return named;
		}
		return undefined;
	}

	private async ensureTitle(): Promise<void> {
		const id = this.session.metadata.id;
		const named = (await this.harness.getName(this.context).catch(() => undefined))?.trim();
		const stored = await readTitleIndex(this.sessionsRoot);
		if (named) {
			if (stored[id] !== named) {
				stored[id] = named;
				await writeTitleIndex(this.sessionsRoot, stored);
			}
			return;
		}
		if (stored[id]?.trim()) {
			await this.harness.setName(stored[id], this.context);
			return;
		}
		const first = await this.firstUserPrompt();
		if (first) await this.setSessionTitle(id, first);
	}

	private async liveSessions(filter?: { cwd?: string }): Promise<JsonlSessionMetadata[]> {
		const index = await readArchiveIndex(this.sessionsRoot);
		const listed = await this.repo.list(filter?.cwd === undefined ? undefined : { cwd: filter.cwd }, this.context);
		return listed.filter((entry) => !isArchived(index, entry.id));
	}

	private applyCwd(cwd: string): void {
		this.cwd = cwd;
		this.executionEnv.cwd = cwd;
	}

	private async rememberProject(): Promise<void> {
		await writeLastProject(this.sessionsRoot, this.cwd).catch(() => {});
	}

	private async replaceSession(open: () => Promise<Session<JsonlSessionMetadata>>): Promise<void> {
		if (await this.isRunning()) throw new Error("Stop the current run before switching sessions.");
		const previous = this.session.metadata;
		await this.harness.close(this.context);
		try {
			const session = await open();
			this.applyCwd(session.metadata.cwd);
			const bound = await Operator.bindSession(
				this.context,
				this.cwd,
				this.models,
				this.model,
				this.thinkingLevel,
				this.executionEnv,
				session,
				this.permissions,
				this.profile,
			);
			this.session = bound.session;
			this.harness = bound.harness;
			this.lane = bound.lane;
			this.open = bound.open;
			this.model = bound.model;
			await this.permissions.loadForCwd(this.cwd, this.context, this.lane);
			await this.resumeOpen();
			await this.ensureTitle();
			await this.rememberProject();
		} catch (error) {
			this.applyCwd(previous.cwd);
			const fallback = await this.repo.open(previous, this.context);
			const bound = await Operator.bindSession(
				this.context,
				this.cwd,
				this.models,
				this.model,
				this.thinkingLevel,
				this.executionEnv,
				fallback,
				this.permissions,
				this.profile,
			);
			this.session = bound.session;
			this.harness = bound.harness;
			this.lane = bound.lane;
			this.open = bound.open;
			this.model = bound.model;
			await this.permissions.loadForCwd(this.cwd, this.context, this.lane);
			throw error;
		}
	}

	async setProviderKey(provider: string, apiKey: string): Promise<void> {
		const id = provider.trim();
		if (!this.models.getProvider(id)) throw new Error(`Unknown provider "${id}"`);
		await this.credentials.setApiKey(id, apiKey);
	}

	async addProvider(input: { id: string; name?: string; baseUrl: string; api: string; apiKey: string }): Promise<void> {
		const id = slugId(input.id);
		const baseUrl = input.baseUrl.trim().replace(/\/$/, "");
		const api = input.api.trim();
		if (!baseUrl) throw new Error("baseUrl is required");
		if (!api) throw new Error("api is required");
		try {
			new URL(baseUrl);
		} catch {
			throw new Error("baseUrl must be a valid URL");
		}
		if (this.models.getProvider(id)) throw new Error(`Provider "${id}" already exists`);
		const file = await loadModelsJson(this.paths.models);
		file.providers[id] = {
			name: input.name?.trim() || id,
			baseUrl,
			api,
			models: [],
		};
		await saveModelsJson(this.paths.models, file);
		await this.credentials.setApiKey(id, input.apiKey);
		this.reloadCatalog(file);
	}

	async addModel(input: {
		provider: string;
		modelId: string;
		name?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}): Promise<void> {
		const providerId = input.provider.trim();
		const modelId = input.modelId.trim();
		if (!providerId || !modelId) throw new Error("provider and model id are required");
		const provider = this.models.getProvider(providerId);
		if (!provider) throw new Error(`Unknown provider "${providerId}"`);
		if (this.models.getModel(providerId, modelId)) throw new Error(`Model ${providerId}/${modelId} already exists`);
		const file = await loadModelsJson(this.paths.models);
		const current = file.providers[providerId] ?? {};
		const next: ModelsJsonModel = {
			id: modelId,
			name: input.name?.trim() || modelId,
			reasoning: input.reasoning,
			contextWindow: input.contextWindow,
			maxTokens: input.maxTokens,
		};
		file.providers[providerId] = {
			...current,
			name: current.name ?? provider.name,
			baseUrl: current.baseUrl ?? provider.baseUrl ?? provider.getModels()[0]?.baseUrl,
			api: current.api ?? provider.getModels()[0]?.api,
			models: [...(current.models ?? []).filter((model) => model.id !== modelId), next],
		};
		await saveModelsJson(this.paths.models, file);
		this.reloadCatalog(file);
	}

	private reloadCatalog(file: Awaited<ReturnType<typeof loadModelsJson>>): void {
		applyCustomCatalog(this.models, file, this.originals);
	}

	async resumeOpen(): Promise<void> {
		for (const operation of this.open) {
			const restored = operation.lane === this.lane.name ? this.lane : await this.harness.lane(operation.lane, this.context);
			const result = await restored.resume(this.context);
			if (!result.ok) throw result.error;
		}
	}

	async close(): Promise<void> {
		this.permissions.rejectAll("Closed");
		await this.harness.close(this.context).catch(() => {});
		await this.repo.close(this.context).catch(() => {});
		await this.executionEnv.cleanup(this.context).catch(() => {});
	}
}

function slugId(id: string): string {
	const value = id.trim().toLowerCase();
	if (!/^[a-z][a-z0-9-]*$/.test(value)) {
		throw new Error("Provider id must start with a letter, then letters, digits, or hyphens");
	}
	return value;
}
