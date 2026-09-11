import { dirname } from "node:path";
import type { AgentMessage, Context, JsonValue } from "@earendil-works/pi-agent-core";
import type { Api, Model, MutableModels } from "@earendil-works/pi-ai";
import type { AgentProfile } from "../profile/types.ts";
import type { Skill } from "../skills/index.ts";
import { noOpUI, type ExtensionContext } from "./types.ts";

export interface ExtensionRuntime {
	cwd: string;
	sessionId: string;
	sessionFile: string;
	models: MutableModels;
	model: { provider: string; id: string };
	thinkingLevel: string;
	profile: AgentProfile;
	skills: Skill[];
	sessionsRoot: string;
	context: Context;
	isIdle(): boolean;
	abortParent(): void;
	appendEntry(customType: string, data?: unknown): void;
	appendMessage(message: AgentMessage): void;
	sendMessage(message: unknown): void;
	getSessionName(): string | undefined;
}

export type ExtensionRuntimeSource = () => ExtensionRuntime | undefined;

export function createExtensionContext(
	cwd: string,
	signal: AbortSignal | undefined,
	runtime: ExtensionRuntime | undefined,
): ExtensionContext {
	const sessionFile = runtime?.sessionFile;
	const sessionId = runtime?.sessionId;
	const model = runtime ? runtime.models.getModel(runtime.model.provider, runtime.model.id) : undefined;
	return {
		ui: noOpUI,
		mode: "print",
		hasUI: false,
		cwd: runtime?.cwd ?? cwd,
		sessionManager: {
			getSessionFile: () => sessionFile,
			getSessionId: () => sessionId,
			getLeafId: () => null,
			getSessionDir: () => (sessionFile ? dirname(sessionFile) : undefined),
			getBranch: () => [],
			createBranchedSession: () => undefined,
		},
		modelRegistry: createModelRegistry(runtime?.models),
		model,
		scopedModels: runtime?.models.getModels() ?? [],
		thinkingLevel: runtime?.thinkingLevel,
		isIdle: () => runtime?.isIdle() ?? true,
		isProjectTrusted: () => true,
		signal,
		abort() {
			runtime?.abortParent();
		},
		hasPendingMessages: () => false,
		shutdown() {},
		getContextUsage: () => undefined,
		compact() {},
		getSystemPrompt: () => "",
	};
}

export function toJsonValue(data: unknown): JsonValue | undefined {
	if (data === undefined) return undefined;
	try {
		return JSON.parse(JSON.stringify(data)) as JsonValue;
	} catch {
		return undefined;
	}
}

export function customTypeOf(message: unknown): string | undefined {
	if (!message || typeof message !== "object") return undefined;
	const customType = (message as { customType?: unknown }).customType;
	return typeof customType === "string" ? customType : undefined;
}

export function asAgentMessage(message: unknown): AgentMessage | undefined {
	if (!message || typeof message !== "object") return undefined;
	const role = (message as { role?: unknown }).role;
	if (typeof role !== "string") return undefined;
	return message as AgentMessage;
}

function createModelRegistry(models: MutableModels | undefined) {
	return {
		getAvailable() {
			return models ? [...models.getModels()] : [];
		},
		find(provider: string, id: string): Model<Api> | undefined {
			return models?.getModel(provider, id);
		},
		hasConfiguredAuth() {
			return true;
		},
		async getApiKeyAndHeaders(model: { provider: string }) {
			return models?.getAuth(model.provider).catch(() => undefined);
		},
		refresh(options?: { allowNetwork?: boolean; signal?: AbortSignal }) {
			return models?.refresh(options) ?? Promise.resolve({ aborted: false, errors: new Map() });
		},
	};
}
