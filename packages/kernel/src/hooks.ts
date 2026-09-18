import type { AgentHarness, AgentLane, Context } from "@earendil-works/pi-agent-core";
import type { ApprovalRemember, ViewApproval } from "../../protocol/src/view.ts";
import { formatArgs } from "./messages.ts";
import { addBashPrefix, readPermissionMode, readStoredPermissions, writePermissionMode } from "./session/permissions.ts";
import {
	activeToolNamesForMode,
	emptyGrants,
	grantsAllow,
	inspectToolCall,
	isApprovalRemember,
	isPermissionMode,
	toolClass,
	type CallVerdict,
	type PermissionMode,
	type SessionGrants,
} from "./tools/policy.ts";
import { commandReadTargets } from "./tools/scope.ts";

interface PendingCall {
	id: string;
	toolName: string;
	args: Record<string, unknown>;
	verdict: CallVerdict;
	resolve: (allow: boolean) => void;
}

export class PermissionGate {
	mode: PermissionMode;
	private readonly pending = new Map<string, PendingCall>();
	private readonly listeners = new Set<() => void>();
	private grants: SessionGrants = emptyGrants();

	constructor(
		private readonly sessionsRoot: string,
		private cwd: string,
		readonly interactive: boolean,
		mode: PermissionMode,
		private readonly toolNames: () => readonly string[],
		private readonly permissionDefault: PermissionMode = "review",
	) {
		this.mode = mode;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	viewApprovals(): ViewApproval[] {
		return [...this.pending.values()].map((call) => ({
			id: call.id,
			toolName: call.toolName,
			args: formatArgs(call.args),
			reason: call.verdict.reason ?? "execute",
			remember: call.verdict.remember,
			prefix: call.verdict.prefix,
			path: call.verdict.displayPath,
		}));
	}

	install(harness: AgentHarness): void {
		harness.hooks.on("before_tool", (event, context) => this.beforeTool(event.toolCallId, event.toolName, event.args, context));
	}

	async applyTools(lane: AgentLane, context: Context): Promise<void> {
		const available = this.toolNames();
		await lane.setActiveTools(activeToolNamesForMode(this.mode, available), context);
	}

	async restoreGrants(): Promise<void> {
		const stored = await readStoredPermissions(this.sessionsRoot, this.cwd);
		this.grants = emptyGrants(stored.bashPrefixes);
	}

	clearSessionGrants(): void {
		this.grants.classes.clear();
		this.grants.paths.clear();
	}

	async loadForCwd(cwd: string, context: Context, lane: AgentLane): Promise<void> {
		const changed = this.cwd !== cwd;
		this.cwd = cwd;
		this.rejectAll("Project changed");
		this.clearSessionGrants();
		if (changed) await this.restoreGrants();
		if (this.interactive) {
			this.mode = (await readPermissionMode(this.sessionsRoot, cwd)) ?? this.permissionDefault;
		}
		await this.applyTools(lane, context);
		this.emit();
	}

	async setMode(mode: PermissionMode, lane: AgentLane, context: Context): Promise<void> {
		if (!isPermissionMode(mode)) throw new Error(`Unknown permission mode: ${String(mode)}`);
		this.mode = mode;
		if (this.interactive) await writePermissionMode(this.sessionsRoot, this.cwd, mode).catch(() => {});
		for (const call of [...this.pending.values()]) {
			const verdict = inspectToolCall(mode, call.toolName, call.args, this.cwd);
			if (!verdict.reason || grantsAllow(verdict, this.grants)) this.settle(call.id, true);
			else if (mode === "read") this.settle(call.id, false);
			else call.verdict = verdict;
		}
		await this.applyTools(lane, context);
		this.emit();
	}

	resolve(id: string, allow: boolean, remember?: ApprovalRemember): void {
		if (!this.pending.has(id)) throw new Error(`Unknown approval: ${id}`);
		if (allow && remember) this.remember(id, remember);
		this.settle(id, allow);
		if (allow && remember) this.sweepGranted();
		this.emit();
	}

	rejectAll(reason: string): void {
		if (this.pending.size === 0) return;
		for (const id of [...this.pending.keys()]) this.settle(id, false);
		void reason;
		this.emit();
	}

	private remember(id: string, remember: ApprovalRemember): void {
		const call = this.pending.get(id);
		if (!call || !isApprovalRemember(remember)) return;
		if (remember === "session") {
			if (call.verdict.reason === "mutate") this.grants.classes.add("mutate");
			if (call.verdict.reason === "execute") this.grants.classes.add("execute");
			return;
		}
		if (remember === "path" && call.verdict.path) {
			this.grants.paths.add(call.verdict.path);
			return;
		}
		if (remember === "prefix" && call.verdict.prefix) {
			if (!this.grants.prefixes.includes(call.verdict.prefix)) this.grants.prefixes.push(call.verdict.prefix);
			void addBashPrefix(this.sessionsRoot, this.cwd, call.verdict.prefix).catch(() => {});
		}
	}

	private sweepGranted(): void {
		for (const call of [...this.pending.values()]) {
			const verdict = inspectToolCall(this.mode, call.toolName, call.args, this.cwd);
			if (!verdict.reason || grantsAllow(verdict, this.grants)) this.settle(call.id, true);
		}
	}

	private settle(id: string, allow: boolean): void {
		const call = this.pending.get(id);
		if (!call) return;
		call.resolve(allow);
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}

	private async beforeTool(
		id: string,
		toolName: string,
		args: Record<string, unknown>,
		context: Context,
	): Promise<{ block?: { reason: string } } | undefined> {
		const verdict = inspectToolCall(this.mode, toolName, args, this.cwd);
		if (verdict.reason === "protected") {
			const kind = toolClass(toolName);
			const command = typeof args.command === "string" ? args.command : "";
			const reading = kind === "observe" || (toolName === "bash" && commandReadTargets(command).length > 0);
			if (reading) return { block: { reason: "受保护路径，不能读取密钥或凭据文件" } };
		}
		if (!verdict.reason || grantsAllow(verdict, this.grants)) return undefined;
		if (this.mode === "read") {
			return { block: { reason: `只读模式不允许 ${toolName}` } };
		}
		if (!this.interactive) {
			return { block: { reason: `需要批准才能运行 ${toolName}（非交互）` } };
		}
		const allow = await this.wait(id, toolName, args, verdict, context);
		if (!allow) return { block: { reason: `已拒绝 ${toolName}` } };
		return undefined;
	}

	private wait(
		id: string,
		toolName: string,
		args: Record<string, unknown>,
		verdict: CallVerdict,
		context: Context,
	): Promise<boolean> {
		return new Promise((resolve) => {
			let done = false;
			const finish = (allow: boolean): void => {
				if (done) return;
				done = true;
				context.abortSignal?.removeEventListener("abort", onAbort);
				this.pending.delete(id);
				resolve(allow);
			};
			const onAbort = (): void => {
				finish(false);
				this.emit();
			};
			if (context.abortSignal?.aborted) {
				finish(false);
				return;
			}
			this.pending.set(id, { id, toolName, args, verdict, resolve: finish });
			context.abortSignal?.addEventListener("abort", onAbort, { once: true });
			this.emit();
		});
	}
}

export function installPermissionHooks(harness: AgentHarness, gate: PermissionGate): void {
	gate.install(harness);
}
