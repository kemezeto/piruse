/** What the browser is allowed to see. No Model, lane, or harness objects. */

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && (THINKING_LEVELS as readonly string[]).includes(value);
}

export interface ViewModelOption {
	provider: string;
	modelId: string;
	name: string;
	thinkingLevels: ThinkingLevel[];
}

export interface ViewProviderChoice {
	id: string;
	name: string;
	custom: boolean;
	authenticated: boolean;
	baseUrl?: string;
	api?: string;
	models: { id: string; name: string; custom: boolean }[];
}

export interface ViewProviderOption {
	id: string;
	name: string;
	baseUrl?: string;
	api?: string;
	authenticated: boolean;
	custom: boolean;
	models: { id: string; name: string; custom: boolean }[];
}

export interface ViewSessionOption {
	id: string;
	title: string;
	modifiedAt: number;
}

export interface ViewArchivedSession {
	id: string;
	title: string;
	cwd: string;
	projectName: string;
	modifiedAt: number;
	archivedAt: number;
}

export interface ViewProjectOption {
	cwd: string;
	name: string;
	sessionCount: number;
	modifiedAt: number;
	sessions: ViewSessionOption[];
}

export type PermissionMode = "read" | "review" | "allow";

export type ApprovalReason = "mutate" | "execute" | "dangerous" | "outside" | "protected";

export type ApprovalRemember = "session" | "prefix" | "path";

export interface ViewApproval {
	id: string;
	toolName: string;
	args: string;
	reason: ApprovalReason;
	remember?: ApprovalRemember[];
	prefix?: string;
	path?: string;
}

export interface ViewPackageItem {
	id: string;
	name: string;
	description?: string;
	source: string;
	path: string;
	enabled: boolean;
}

export interface ViewPackageStatus {
	skills: ViewPackageItem[];
	extensions: ViewPackageItem[];
	diagnostics: { level: "error" | "warning"; message: string }[];
	unsupported: string[];
}

export interface ViewState {
	sessionId: string;
	sessionTitle: string;
	cwd: string;
	sessionPath: string;
	model: { provider: string; modelId: string } | null;
	thinkingLevel: ThinkingLevel;
	models: ViewModelOption[];
	providers: ViewProviderOption[];
	providerChoices: ViewProviderChoice[];
	projects: ViewProjectOption[];
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	permissionMode: PermissionMode;
	pendingApprovals: ViewApproval[];
	packages: ViewPackageStatus;
	running: boolean;
	items: ViewItem[];
}

export type ViewItem =
	| { id: string; kind: "user"; text: string; at?: number }
	| { id: string; kind: "assistant"; text: string; thinking?: string; thinkingStreaming?: boolean; streaming?: boolean; at?: number; tokens?: number }
	| {
			id: string;
			kind: "tool";
			name: string;
			args: string;
			result?: string;
			running: boolean;
			isError?: boolean;
			at?: number;
			durationMs?: number;
	  }
	| { id: string; kind: "note"; text: string; at?: number };

export interface ViewMeta {
	sessionId: string;
	cwd: string;
	sessionPath: string;
	sessionTitle: string;
	models: ViewModelOption[];
	providers: ViewProviderOption[];
	providerChoices: ViewProviderChoice[];
	projects: ViewProjectOption[];
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	permissionMode: PermissionMode;
	pendingApprovals: ViewApproval[];
	packages: ViewPackageStatus;
	model: { provider: string; modelId: string } | null;
	thinkingLevel: ThinkingLevel;
}
