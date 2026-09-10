import type { AgentHarness, AgentLane, Context } from "@earendil-works/pi-agent-core";
import type { ViewApproval } from "../../protocol/src/view.ts";
import { formatArgs } from "./messages.ts";
import { readPermissionMode, writePermissionMode } from "./session/permissions.ts";
import {
	activeToolNamesForMode,
	approvalReason,
	type ApprovalReason,
	isPermissionMode,
	type PermissionMode,
} from "./tools/policy.ts";

interface PendingCall {
	id: string;
	toolName: string;
	args: Record<string, unknown>;
	reason: ApprovalReason;
	resolve: (allow: boolean) => void;
}

export class PermissionGate {
	mode: PermissionMode;
	private readonly pending = new Map<string, PendingCall>();
	private readonly listeners = new Set<() => void>();

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
			reason: call.reason,
		}));
	}

	install(harness: AgentHarness): void {
		harness.hooks.on("before_tool", (event, context) => this.beforeTool(event.toolCallId, event.toolName, event.args, context));
	}

	async applyTools(lane: AgentLane, context: Context): Promise<void> {
		const available = this.toolNames();
		await lane.setActiveTools(activeToolNamesForMode(this.mode, available), context);
	}

	async loadForCwd(cwd: string, context: Context, lane: AgentLane): Promise<void> {
		this.cwd = cwd;
		this.rejectAll("Project changed");
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
			const still = approvalReason(mode, call.toolName, call.args);
			if (!still) this.settle(call.id, true);
			else if (mode === "read") this.settle(call.id, false);
		}
		await this.applyTools(lane, context);
		this.emit();
	}

	resolve(id: string, allow: boolean): void {
		if (!this.pending.has(id)) throw new Error(`Unknown approval: ${id}`);
		this.settle(id, allow);
		this.emit();
	}

	rejectAll(reason: string): void {
		if (this.pending.size === 0) return;
		for (const id of [...this.pending.keys()]) this.settle(id, false);
		void reason;
		this.emit();
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
		const reason = approvalReason(this.mode, toolName, args);
		if (!reason) return undefined;
		if (this.mode === "read") {
			return { block: { reason: `只读模式不允许 ${toolName}` } };
		}
		if (!this.interactive) {
			return { block: { reason: `需要批准才能运行 ${toolName}（非交互）` } };
		}
		const allow = await this.wait(id, toolName, args, reason, context);
		if (!allow) return { block: { reason: `已拒绝 ${toolName}` } };
		return undefined;
	}

	private wait(
		id: string,
		toolName: string,
		args: Record<string, unknown>,
		reason: ApprovalReason,
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
			this.pending.set(id, { id, toolName, args, reason, resolve: finish });
			context.abortSignal?.addEventListener("abort", onAbort, { once: true });
			this.emit();
		});
	}
}

export function installPermissionHooks(harness: AgentHarness, gate: PermissionGate): void {
	gate.install(harness);
}
