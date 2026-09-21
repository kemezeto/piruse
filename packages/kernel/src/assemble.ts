import type { MutableModels } from "@earendil-works/pi-ai";
import { compactionSettings } from "./compaction/settings.ts";
import { ExtensionHost } from "./extensions/index.ts";
import { installPermissionHooks, PermissionGate } from "./hooks.ts";
import { clampModelThinking } from "./models/index.ts";
import { listInstalledResources, type InstalledResources } from "./packages/inventory.ts";
import type { AgentProfile } from "./profile/index.ts";
import {
	type AgentHarness,
	type AgentLane,
	type Context,
	createHarness,
	type JsonlSessionMetadata,
	type NodeExecutionEnv,
	type OpenOperation,
	type Session,
	type ThinkingLevel,
} from "./runtime/index.ts";
import { skillsFromResources, type Skill } from "./skills/index.ts";

export interface LiveConfig {
	model: { provider: string; id: string };
	thinkingLevel: ThinkingLevel;
}

export interface BoundSession {
	session: Session<JsonlSessionMetadata>;
	harness: AgentHarness;
	lane: AgentLane;
	open: OpenOperation[];
	live: LiveConfig;
}

export interface Workspace {
	inventory: InstalledResources;
	skills: Skill[];
}

export async function loadWorkspace(options: {
	cwd: string;
	agentDir?: string;
	models: MutableModels;
	extensions: ExtensionHost;
}): Promise<Workspace> {
	const inventory = await listInstalledResources({ cwd: options.cwd, agentDir: options.agentDir });
	await options.extensions.load({
		cwd: options.cwd,
		models: options.models,
		paths: inventory.extensions.filter((item) => item.enabled).map((item) => item.path),
	});
	return { inventory, skills: skillsFromResources(inventory.skills) };
}

export async function bindSession(options: {
	context: Context;
	cwd: string;
	models: MutableModels;
	model: { provider: string; id: string };
	thinkingLevel: ThinkingLevel;
	executionEnv: NodeExecutionEnv;
	session: Session<JsonlSessionMetadata>;
	permissions: PermissionGate;
	profile: AgentProfile;
	skills: readonly Skill[];
	extensions: ExtensionHost;
}): Promise<BoundSession> {
	const catalogModel = options.models.getModel(options.model.provider, options.model.id);
	if (!catalogModel) throw new Error(`Unknown model ${options.model.provider}/${options.model.id}`);
	const live: LiveConfig = {
		model: { provider: catalogModel.provider, id: catalogModel.id },
		thinkingLevel: clampModelThinking(catalogModel, options.thinkingLevel),
	};
	const { harness, open } = await createHarness(
		{
			session: options.session,
			models: options.models,
			model: catalogModel,
			thinkingLevel: live.thinkingLevel,
			tools: [...options.profile.tools(), ...options.extensions.tools()],
			toolContext: { env: options.executionEnv },
			systemPrompt: () =>
				options.profile.systemPrompt(options.executionEnv.cwd, options.skills, {
					provider: live.model.provider,
					modelId: live.model.id,
					thinkingLevel: live.thinkingLevel,
				}),
			compaction: compactionSettings,
		},
		options.context,
	);
	installPermissionHooks(harness, options.permissions);
	options.extensions.installHooks(harness);
	const lane = await harness.lane("main", options.context);
	await options.permissions.applyTools(lane, options.context);
	const currentModel = await lane.getModel(options.context);
	const liveModel = currentModel
		? options.models.getModel(currentModel.provider, currentModel.id) ?? catalogModel
		: catalogModel;
	const liveThinking = await lane.getThinkingLevel(options.context);
	const nextThinking = clampModelThinking(liveModel, liveThinking);
	if (nextThinking !== liveThinking) await lane.setThinkingLevel(nextThinking, options.context);
	live.model = currentModel
		? { provider: currentModel.provider, id: currentModel.id }
		: { provider: options.model.provider, id: options.model.id };
	live.thinkingLevel = nextThinking;
	return { session: options.session, harness, lane, open, live };
}
