import type { MutableModels, Provider } from "@earendil-works/pi-ai";
import type { AnalyseSnapshot } from "../../protocol/src/analyse.ts";
import type {
	ApprovalRemember,
	ViewArchivedSession,
	ViewApproval,
	ViewMeta,
	ViewModelOption,
	ViewPackageStatus,
	ViewProjectOption,
	ViewProviderChoice,
	ViewProviderOption,
	ViewSessionOption,
	ViewState,
} from "../../protocol/src/view.ts";
import { bindSession, type BoundSession, loadWorkspace, type LiveConfig } from "./assemble.ts";
import { ExtensionHost } from "./extensions/index.ts";
import { asAgentMessage, customTypeOf, toJsonValue } from "./extensions/runtime.ts";
import { PermissionGate } from "./hooks.ts";
import { userText } from "./messages.ts";
import { FileCredentialStore } from "./models/auth-store.ts";
import { applyCustomCatalog } from "./models/apply-custom.ts";
import {
	asThinkingLevel,
	clampModelThinking,
	listAvailableModels,
	listProviderCatalog,
	patchAgentSettings,
} from "./models/index.ts";
import { loadModelsJson, saveModelsJson, type ModelsJsonModel } from "./models/models-json.ts";
import type { AgentPaths } from "./models/paths.ts";
import { packageStatus as viewPackages, setResourceEnabled, type InstalledResources } from "./packages/index.ts";
import type { AgentProfile } from "./profile/index.ts";
import {
	type AgentHarness,
	type AgentLane,
	type Context,
	type JsonlSessionMetadata,
	type JsonlSessionRepo,
	type NodeExecutionEnv,
	type OpenOperation,
	type Session,
	type ThinkingLevel,
} from "./runtime/index.ts";
import { subscribeLaneRun, subscribeLaneView, type RunHandlers, type ViewSubscription } from "./runtime/watch.ts";
import { emptyView } from "./view.ts";
import { loadAnalyseSnapshot } from "./session/analyse.ts";
import { isArchived, readArchiveIndex, writeArchiveIndex } from "./session/archive.ts";
import { openFirstReadable, shortId } from "./session/open.ts";
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
import type { Skill } from "./skills/index.ts";
import { isPermissionMode, type PermissionMode } from "./tools/policy.ts";

export type { RunHandlers, ViewSubscription };

export interface OperatorOpen {
	context: Context;
	cwd: string;
	models: MutableModels;
	authSource: string | undefined;
	repo: JsonlSessionRepo;
	sessionsRoot: string;
	executionEnv: NodeExecutionEnv;
	credentials: FileCredentialStore;
	paths: AgentPaths;
	originals: Map<string, Provider>;
	permissions: PermissionGate;
	profile: AgentProfile;
	extensions: ExtensionHost;
	inventory: InstalledResources;
	skills: Skill[];
	session: Session<JsonlSessionMetadata>;
	thinkingLevel: ThinkingLevel;
	bound?: BoundSession;
}

export interface BootedHarness {
	cwd: string;
	sessionId: string;
	sessionPath: string;
	resumeLabels: string[];
	model: { provider: string; id: string } | null;
	authSource: string | undefined;
	prompt(text: string): Promise<void>;
	abort(): Promise<void>;
	subscribeView(getMeta: () => ViewMeta, onState: (state: ViewState) => void): Promise<ViewSubscription>;
	subscribeRun(handlers: RunHandlers): Promise<() => void>;
	resumeOpen(): Promise<void>;
	close(): Promise<void>;
	listModels(): Promise<ViewModelOption[]>;
	listCatalog(): Promise<{ providers: ViewProviderOption[]; choices: ViewProviderChoice[] }>;
	listSessions(): Promise<ViewSessionOption[]>;
	listArchivedSessions(): Promise<ViewArchivedSession[]>;
	listProjects(): Promise<ViewProjectOption[]>;
	listAnalyse(): Promise<AnalyseSnapshot>;
	sessionTitle(): Promise<string>;
	setSessionTitle(sessionId: string | undefined, title: string): Promise<void>;
	rememberTitleFromPrompt(text: string): Promise<void>;
	setModel(provider: string, modelId: string): Promise<void>;
	setThinkingLevel(level: string): Promise<void>;
	openSession(sessionId: string): Promise<void>;
	newSession(): Promise<void>;
	openProject(cwd: string): Promise<void>;
	archiveSession(sessionId?: string): Promise<void>;
	unarchiveSession(sessionId: string): Promise<void>;
	deleteArchivedSession(sessionId: string): Promise<void>;
	setPermissionMode(mode: PermissionMode): Promise<void>;
	resolveApproval(id: string, allow: boolean, remember?: ApprovalRemember): void;
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
	applyModelSetup(input: {
		provider: string;
		name?: string;
		baseUrl?: string;
		api?: string;
		apiKey?: string;
		modelId: string;
		modelName?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}): Promise<void>;
	deleteProvider(id: string): Promise<void>;
	deleteProviderKey(provider: string): Promise<void>;
	deleteModel(provider: string, modelId: string): Promise<void>;
	packageStatus(): ViewPackageStatus;
	setSkillEnabled(id: string, enabled: boolean): Promise<void>;
	setExtensionEnabled(id: string, enabled: boolean): Promise<void>;
	isRunning(): Promise<boolean>;
}

export class Operator implements BootedHarness {
	cwd: string;
	model: { provider: string; id: string } | null;
	thinkingLevel: ThinkingLevel;
	private session: Session<JsonlSessionMetadata>;
	private harness: AgentHarness | undefined;
	private lane: AgentLane | undefined;
	private open: OpenOperation[];
	private live: LiveConfig | undefined;
	private inventory: InstalledResources;
	private skills: Skill[];

	private constructor(
		private readonly context: Context,
		cwd: string,
		readonly models: MutableModels,
		readonly authSource: string | undefined,
		private readonly repo: JsonlSessionRepo,
		private readonly sessionsRoot: string,
		private readonly executionEnv: NodeExecutionEnv,
		private readonly credentials: FileCredentialStore,
		private readonly paths: AgentPaths,
		private readonly originals: Map<string, Provider>,
		private readonly permissions: PermissionGate,
		readonly profile: AgentProfile,
		private readonly extensions: ExtensionHost,
		session: Session<JsonlSessionMetadata>,
		bound: BoundSession | undefined,
		thinkingLevel: ThinkingLevel,
		workspace: { inventory: InstalledResources; skills: Skill[] },
	) {
		this.cwd = cwd;
		this.session = bound?.session ?? session;
		this.harness = bound?.harness;
		this.lane = bound?.lane;
		this.open = bound?.open ?? [];
		this.live = bound?.live;
		this.model = bound?.live.model ?? null;
		this.thinkingLevel = bound?.live.thinkingLevel ?? thinkingLevel;
		this.inventory = workspace.inventory;
		this.skills = workspace.skills;
	}

	get sessionId(): string {
		return this.session.metadata.id;
	}

	get sessionPath(): string {
		return this.session.metadata.path;
	}

	get resumeLabels(): string[] {
		return this.open.map((operation) => `${operation.lane}/${operation.operationId}`);
	}

	static async open(input: OperatorOpen): Promise<Operator> {
		const operator = new Operator(
			input.context,
			input.cwd,
			input.models,
			input.authSource,
			input.repo,
			input.sessionsRoot,
			input.executionEnv,
			input.credentials,
			input.paths,
			input.originals,
			input.permissions,
			input.profile,
			input.extensions,
			input.session,
			input.bound,
			input.thinkingLevel,
			{ inventory: input.inventory, skills: input.skills },
		);
		await operator.ensureTitle();
		operator.syncExtensionRuntime();
		return operator;
	}

	async listModels(): Promise<ViewModelOption[]> {
		return listAvailableModels(this.models, this.model ?? undefined);
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
		listed.sort((left, right) => right.createdAt - left.createdAt);
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

	async listAnalyse(): Promise<AnalyseSnapshot> {
		const listed = await this.liveSessions();
		const titles = await this.titlesFor(listed);
		return loadAnalyseSnapshot(listed, titles);
	}

	async sessionTitle(): Promise<string> {
		const id = this.session.metadata.id;
		const named = this.harness
			? (await this.harness.getName(this.context).catch(() => undefined))?.trim()
			: undefined;
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
		if (id === this.session.metadata.id && this.harness) {
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
		if (this.harness && (await this.harness.getName(this.context).catch(() => undefined))?.trim()) return;
		if ((await readTitleIndex(this.sessionsRoot))[id]?.trim()) return;
		const name = titleFromPrompt(text);
		if (!name) return;
		await this.setSessionTitle(id, name);
	}

	packageStatus(): ViewPackageStatus {
		return viewPackages(this.inventory, {
			diagnostics: this.extensions.diagnostics(),
			unsupported: this.extensions.unsupported(),
		});
	}

	async setSkillEnabled(id: string, enabled: boolean): Promise<void> {
		await this.setPackageResourceEnabled("skills", id, enabled);
	}

	async setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
		await this.setPackageResourceEnabled("extensions", id, enabled);
	}

	private async setPackageResourceEnabled(
		kind: "skills" | "extensions",
		id: string,
		enabled: boolean,
	): Promise<void> {
		if (await this.isRunning()) throw new Error("Stop the current run before changing packages.");
		await setResourceEnabled({ cwd: this.cwd, agentDir: this.paths.dir, kind, id, enabled });
		await this.replaceSession(() => this.repo.open(this.session.metadata, this.context));
	}

	async isRunning(): Promise<boolean> {
		if (!this.lane) return false;
		const info = await this.lane.inspectExecution(this.context);
		return info.current !== null;
	}

	async setModel(provider: string, modelId: string): Promise<void> {
		const found = this.models.getModel(provider, modelId);
		if (!found) throw new Error(`Unknown model ${provider}/${modelId}`);
		const auth = await this.models.checkAuth(found.provider);
		if (!auth) throw new Error(`${found.provider} is not authenticated`);
		if (!this.lane) {
			await this.openBound({ provider: found.provider, id: found.id });
			return;
		}
		await this.lane.setModel({ provider: found.provider, modelId: found.id }, this.context);
		this.live = {
			model: { provider: found.provider, id: found.id },
			thinkingLevel: this.thinkingLevel,
		};
		this.model = this.live.model;
		const current = await this.lane.getThinkingLevel(this.context);
		const next = clampModelThinking(found, current);
		if (next !== current) await this.lane.setThinkingLevel(next, this.context);
		this.live.thinkingLevel = next;
		this.thinkingLevel = next;
		this.syncExtensionRuntime();
	}

	async setThinkingLevel(level: string): Promise<void> {
		const parsed = asThinkingLevel(level);
		if (!parsed) throw new Error(`Unknown thinking level "${level}"`);
		if (!this.model || !this.lane) throw new Error("还没有选择模型。");
		const found = this.models.getModel(this.model.provider, this.model.id);
		if (!found) throw new Error(`Unknown model ${this.model.provider}/${this.model.id}`);
		const next = clampModelThinking(found, parsed);
		await this.lane.setThinkingLevel(next, this.context);
		if (this.live) this.live.thinkingLevel = next;
		this.thinkingLevel = next;
		await patchAgentSettings(this.paths.settings, { defaultThinkingLevel: parsed });
		this.syncExtensionRuntime();
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

	resolveApproval(id: string, allow: boolean, remember?: ApprovalRemember): void {
		this.permissions.resolve(id, allow, remember);
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
		const named = this.harness
			? (await this.harness.getName(this.context).catch(() => undefined))?.trim()
			: undefined;
		const stored = await readTitleIndex(this.sessionsRoot);
		if (named) {
			if (stored[id] !== named) {
				stored[id] = named;
				await writeTitleIndex(this.sessionsRoot, stored);
			}
			return;
		}
		if (stored[id]?.trim()) {
			if (this.harness) await this.harness.setName(stored[id], this.context);
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

	private applyBound(bound: BoundSession): void {
		this.session = bound.session;
		this.harness = bound.harness;
		this.lane = bound.lane;
		this.open = bound.open;
		this.live = bound.live;
		this.model = bound.live.model;
		this.thinkingLevel = bound.live.thinkingLevel;
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
		if (this.harness) await this.harness.close(this.context);
		try {
			await this.attachSession(await open());
			await this.resumeOpen();
			await this.ensureTitle();
			await this.rememberProject();
			this.syncExtensionRuntime();
		} catch (error) {
			this.applyCwd(previous.cwd);
			const fallback = await this.repo.open(previous, this.context);
			await this.attachSession(fallback);
			this.syncExtensionRuntime();
			throw error;
		}
	}

	private async attachSession(session: Session<JsonlSessionMetadata>): Promise<void> {
		this.session = session;
		this.applyCwd(session.metadata.cwd);
		const workspace = await loadWorkspace({
			cwd: this.cwd,
			agentDir: this.paths.dir,
			models: this.models,
			extensions: this.extensions,
		});
		this.inventory = workspace.inventory;
		this.skills = workspace.skills;
		if (!this.model) {
			this.harness = undefined;
			this.lane = undefined;
			this.open = [];
			this.live = undefined;
			await this.permissions.loadForCwd(this.cwd, this.context);
			return;
		}
		const bound = await bindSession({
			context: this.context,
			cwd: this.cwd,
			models: this.models,
			model: this.model,
			thinkingLevel: this.thinkingLevel,
			executionEnv: this.executionEnv,
			session,
			permissions: this.permissions,
			profile: this.profile,
			skills: this.skills,
			extensions: this.extensions,
		});
		this.applyBound(bound);
		await this.permissions.loadForCwd(this.cwd, this.context, bound.lane);
	}

	private async openBound(model: { provider: string; id: string }): Promise<void> {
		if (this.harness) await this.harness.close(this.context);
		const bound = await bindSession({
			context: this.context,
			cwd: this.cwd,
			models: this.models,
			model,
			thinkingLevel: this.thinkingLevel,
			executionEnv: this.executionEnv,
			session: this.session,
			permissions: this.permissions,
			profile: this.profile,
			skills: this.skills,
			extensions: this.extensions,
		});
		this.applyBound(bound);
		await this.permissions.loadForCwd(this.cwd, this.context, bound.lane);
		this.syncExtensionRuntime();
	}

	async setProviderKey(provider: string, apiKey: string): Promise<void> {
		const id = provider.trim();
		if (!this.models.getProvider(id)) throw new Error(`Unknown provider "${id}"`);
		await this.credentials.setApiKey(id, apiKey);
		const models = this.models.getProvider(id)?.getModels() ?? [];
		const next = this.model?.provider === id ? this.model : models[0] ? { provider: id, id: models[0].id } : undefined;
		if (next) await this.setModel(next.provider, next.id);
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
		if (await this.models.checkAuth(providerId)) await this.setModel(providerId, modelId);
	}

	private reloadCatalog(file: Awaited<ReturnType<typeof loadModelsJson>>): void {
		applyCustomCatalog(this.models, file, this.originals);
	}

	async applyModelSetup(input: {
		provider: string;
		name?: string;
		baseUrl?: string;
		api?: string;
		apiKey?: string;
		modelId: string;
		modelName?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}): Promise<void> {
		const modelId = input.modelId.trim();
		if (!modelId) throw new Error("模型 ID 不能为空");
		const requested = input.provider.trim();
		if (!requested) throw new Error("请选择服务商");
		const providerId = this.models.getProvider(requested) ? requested : slugId(requested);
		const file = await loadModelsJson(this.paths.models);
		if (!this.models.getProvider(providerId) && !file.providers[providerId]) {
			const baseUrl = cleanBaseUrl(input.baseUrl);
			const api = input.api?.trim() ?? "";
			if (!baseUrl || !api || !input.apiKey?.trim()) throw new Error("自定义服务商需要 Base URL、API 和 API Key");
			file.providers[providerId] = {
				name: input.name?.trim() || providerId,
				baseUrl,
				api,
				models: [],
			};
		} else if (file.providers[providerId] && !this.originals.has(providerId)) {
			const current = file.providers[providerId];
			if (input.name?.trim()) current.name = input.name.trim();
			if (input.baseUrl?.trim()) current.baseUrl = cleanBaseUrl(input.baseUrl);
			if (input.api?.trim()) current.api = input.api.trim();
		}

		const catalogHas = Boolean(this.models.getModel(providerId, modelId));
		const overlay = file.providers[providerId];
		const overlayModel = overlay?.models?.find((model) => model.id === modelId);
		if (!catalogHas) {
			const base = this.models.getProvider(providerId);
			const current = file.providers[providerId] ?? {};
			const next: ModelsJsonModel = {
				id: modelId,
				name: input.modelName?.trim() || modelId,
				reasoning: input.reasoning,
				contextWindow: input.contextWindow,
				maxTokens: input.maxTokens,
			};
			file.providers[providerId] = {
				...current,
				name: current.name ?? input.name?.trim() ?? base?.name ?? providerId,
				baseUrl: current.baseUrl ?? cleanBaseUrl(input.baseUrl) ?? base?.baseUrl ?? base?.getModels()[0]?.baseUrl,
				api: current.api ?? input.api?.trim() ?? base?.getModels()[0]?.api,
				models: [...(current.models ?? []).filter((model) => model.id !== modelId), next],
			};
		} else if (overlayModel) {
			overlayModel.name = input.modelName?.trim() || overlayModel.name;
			if (input.reasoning !== undefined) overlayModel.reasoning = input.reasoning;
			if (input.contextWindow) overlayModel.contextWindow = input.contextWindow;
			if (input.maxTokens) overlayModel.maxTokens = input.maxTokens;
		}

		await saveModelsJson(this.paths.models, file);
		this.reloadCatalog(file);
		const apiKey = input.apiKey?.trim();
		if (apiKey) await this.credentials.setApiKey(providerId, apiKey);
		await this.setModel(providerId, modelId);
	}

	async deleteProvider(id: string): Promise<void> {
		const providerId = id.trim();
		if (this.originals.has(providerId)) throw new Error("内置服务商不能删除，可以删除密钥");
		const file = await loadModelsJson(this.paths.models);
		if (!file.providers[providerId]) throw new Error(`Unknown provider "${providerId}"`);
		delete file.providers[providerId];
		await saveModelsJson(this.paths.models, file);
		await this.credentials.delete(providerId);
		this.models.deleteProvider(providerId);
		if (this.model?.provider === providerId) this.model = null;
	}

	async deleteProviderKey(provider: string): Promise<void> {
		const id = provider.trim();
		if (!this.models.getProvider(id)) throw new Error(`Unknown provider "${id}"`);
		await this.credentials.delete(id);
		if (this.model?.provider === id) this.model = null;
	}

	async deleteModel(provider: string, modelId: string): Promise<void> {
		const providerId = provider.trim();
		const id = modelId.trim();
		const file = await loadModelsJson(this.paths.models);
		const current = file.providers[providerId];
		if (!current?.models?.some((model) => model.id === id)) throw new Error("只能删除自定义模型");
		current.models = current.models.filter((model) => model.id !== id);
		await saveModelsJson(this.paths.models, file);
		this.reloadCatalog(file);
		if (this.model?.provider === providerId && this.model.id === id) this.model = null;
	}

	async resumeOpen(): Promise<void> {
		if (!this.harness || !this.lane) return;
		for (const operation of this.open) {
			const restored = operation.lane === this.lane.name ? this.lane : await this.harness.lane(operation.lane, this.context);
			const result = await restored.resume(this.context);
			if (!result.ok) throw result.error;
		}
	}

	async prompt(text: string): Promise<void> {
		if (!this.model || !this.lane) {
			throw new Error("还没有可用的模型密钥。请先在设置里添加密钥并选择模型。");
		}
		const authed = await this.models.checkAuth(this.model.provider);
		if (!authed) {
			throw new Error("还没有可用的模型密钥。请先在设置里添加密钥并选择模型。");
		}
		const result = await this.lane.prompt(text, undefined, this.context);
		if (!result.ok) throw new Error(result.error.message);
	}

	async abort(): Promise<void> {
		if (!this.lane) return;
		const result = await this.lane.abort(this.context);
		if (!result.ok) throw new Error(result.error.message);
	}

	subscribeView(getMeta: () => ViewMeta, onState: (state: ViewState) => void): Promise<ViewSubscription> {
		if (!this.lane) {
			return Promise.resolve({
				unsubscribe() {},
				view: (meta) => emptyView(meta),
			});
		}
		return subscribeLaneView({
			lane: this.lane,
			context: this.context,
			getMeta,
			onState,
		});
	}

	subscribeRun(handlers: RunHandlers): Promise<() => void> {
		if (!this.lane) return Promise.resolve(() => {});
		return subscribeLaneRun({
			lane: this.lane,
			context: this.context,
			handlers,
		});
	}

	private syncExtensionRuntime(): void {
		if (!this.lane || !this.model) return;
		const lane = this.lane;
		const model = this.model;
		this.extensions.bindRuntime({
			cwd: this.cwd,
			sessionId: this.session.metadata.id,
			sessionFile: this.session.metadata.path,
			models: this.models,
			model,
			thinkingLevel: this.thinkingLevel,
			profile: this.profile,
			skills: this.skills,
			sessionsRoot: this.sessionsRoot,
			context: this.context,
			isIdle: () => true,
			abortParent: () => {
				void lane.abort(this.context);
			},
			appendEntry: (customType, data) => {
				void lane.appendCustomEntry(customType, toJsonValue(data), this.context);
			},
			appendMessage: (message) => {
				void lane.appendMessage(message, this.context);
			},
			sendMessage: (message) => {
				const customType = customTypeOf(message);
				if (customType) {
					void lane.appendCustomEntry(customType, toJsonValue(message), this.context);
					return;
				}
				const agentMessage = asAgentMessage(message);
				if (agentMessage) void lane.appendMessage(agentMessage, this.context);
			},
			getSessionName: () => undefined,
		});
	}

	async close(): Promise<void> {
		this.permissions.rejectAll("Closed");
		this.extensions.unload();
		if (this.harness) await this.harness.close(this.context).catch(() => {});
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

function cleanBaseUrl(value: string | undefined): string | undefined {
	const baseUrl = value?.trim().replace(/\/$/, "");
	if (!baseUrl) return undefined;
	try {
		new URL(baseUrl);
	} catch {
		throw new Error("baseUrl must be a valid URL");
	}
	return baseUrl;
}
