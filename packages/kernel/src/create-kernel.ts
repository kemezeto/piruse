import { bindSession, loadWorkspace } from "./assemble.ts";
import { ExtensionHost } from "./extensions/index.ts";
import { Operator, type BootedHarness, type RunHandlers, type ViewSubscription } from "./harness.ts";
import { PermissionGate } from "./hooks.ts";
import { resolveConfiguredModel } from "./models/index.ts";
import { resolveProfile, type AgentProfileId } from "./profile/index.ts";
import { BACKGROUND_CONTEXT, createExecutionEnv, createSessionRepo } from "./runtime/index.ts";
import { isArchived, readArchiveIndex } from "./session/archive.ts";
import { openInitialSession } from "./session/open.ts";
import { readPermissionMode } from "./session/permissions.ts";
import { resolveProjectDirectory } from "./session/projects.ts";
import type { PermissionMode } from "./tools/policy.ts";

export type { BootedHarness, Operator, RunHandlers, ViewSubscription };

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

/** Assemble models, session, skills, extensions, tools, then hand them to Operator. */
export async function bootHarness(options: BootOptions): Promise<Operator> {
	const context = BACKGROUND_CONTEXT;
	const configured = await resolveConfiguredModel({
		agentDir: options.agentDir,
		provider: options.provider,
		model: options.model,
	});
	const executionEnv = createExecutionEnv(options.cwd);
	const bootCwd = await resolveProjectDirectory(executionEnv, options.cwd, context);
	executionEnv.cwd = bootCwd;
	const repo = createSessionRepo(executionEnv, options.sessionsRoot);
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
	const extensions = new ExtensionHost();
	const workspace = await loadWorkspace({
		cwd,
		agentDir: configured.paths.dir,
		models: configured.models,
		extensions,
	});
	const gate = new PermissionGate(
		options.sessionsRoot,
		cwd,
		interactive,
		mode,
		() => [...profile.tools(), ...extensions.tools()].map((tool) => tool.name),
		profile.permissionDefault,
	);
	await gate.restoreGrants();
	const bound = await bindSession({
		context,
		cwd,
		models: configured.models,
		model: configured.model,
		thinkingLevel: configured.thinkingLevel,
		executionEnv,
		session,
		permissions: gate,
		profile,
		skills: workspace.skills,
		extensions,
	});
	return Operator.open({
		context,
		cwd,
		models: configured.models,
		authSource: configured.authSource,
		repo,
		sessionsRoot: options.sessionsRoot,
		executionEnv,
		credentials: configured.credentials,
		paths: configured.paths,
		originals: configured.originals,
		permissions: gate,
		profile,
		extensions,
		inventory: workspace.inventory,
		skills: workspace.skills,
		bound,
	});
}
