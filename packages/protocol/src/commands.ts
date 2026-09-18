import type { ViewState, PermissionMode, ApprovalRemember, ThinkingLevel } from "./view.ts";

/** Browser → host. No harness types. */
export type ClientMessage =
	| { type: "prompt"; text?: string }
	| { type: "abort" }
	| { type: "setModel"; provider?: string; modelId?: string }
	| { type: "setThinkingLevel"; level?: ThinkingLevel }
	| { type: "openSession"; sessionId?: string }
	| { type: "newSession" }
	| { type: "openProject"; cwd?: string }
	| { type: "pickProject" }
	| { type: "archiveSession"; sessionId?: string }
	| { type: "unarchiveSession"; sessionId?: string }
	| { type: "deleteArchivedSession"; sessionId?: string }
	| { type: "setSessionTitle"; sessionId?: string; title?: string }
	| { type: "setPermissionMode"; mode?: PermissionMode }
	| { type: "approveTool"; id?: string; remember?: ApprovalRemember }
	| { type: "denyTool"; id?: string }
	| { type: "addProvider"; id?: string; name?: string; baseUrl?: string; api?: string; apiKey?: string }
	| { type: "addModel"; provider?: string; modelId?: string; name?: string; reasoning?: boolean; contextWindow?: number; maxTokens?: number }
	| { type: "setProviderKey"; provider?: string; apiKey?: string }
	| { type: "setSkillEnabled"; id?: string; enabled?: boolean }
	| { type: "setExtensionEnabled"; id?: string; enabled?: boolean };

export type SocketPayload = { type: "state"; state: ViewState } | { type: "notice"; text: string };
