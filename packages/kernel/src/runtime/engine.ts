import {
	AgentHarness,
	type AgentHarnessOptions,
	type Context,
	JsonlSessionRepo,
	NodeExecutionEnv,
	type OpenOperation,
} from "./pi.ts";

export function createExecutionEnv(cwd: string): NodeExecutionEnv {
	return new NodeExecutionEnv({ cwd });
}

export function createSessionRepo(fileSystem: NodeExecutionEnv, sessionsRoot: string): JsonlSessionRepo {
	return new JsonlSessionRepo({ fileSystem, sessionsRoot });
}

export async function createHarness<TContext extends object | undefined = object | undefined>(
	options: AgentHarnessOptions<TContext>,
	context: Context,
): Promise<{ harness: AgentHarness<TContext>; open: OpenOperation[] }> {
	return AgentHarness.create(options, context);
}
