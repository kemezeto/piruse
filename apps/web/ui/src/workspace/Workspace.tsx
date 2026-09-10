import { useEffect, useRef } from "react";
import type { ViewState } from "@protocol/view";
import { ApprovalList } from "../approvals/ApprovalList";
import { ModelPicker } from "../pickers/ModelPicker";
import { PermissionPicker } from "../pickers/PermissionPicker";
import { ProjectPicker } from "../pickers/ProjectPicker";
import type { HostCommand, Line } from "../socket";
import { Composer } from "./Composer";
import { Thread } from "./Thread";

export function Workspace({
	state,
	notice,
	line,
	onCommand,
	onSend,
}: {
	state: ViewState | null;
	notice: string;
	line: Line;
	onCommand: HostCommand;
	onSend: (text: string) => void;
}) {
	const stageRef = useRef<HTMLDivElement>(null);
	const empty = !state || state.items.length === 0;

	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [state?.items]);

	const modelPicker = state ? (
		<ModelPicker
			current={state.model}
			models={state.models}
			onSelect={(model) => onCommand({ type: "setModel", provider: model.provider, modelId: model.modelId })}
		/>
	) : null;
	const workspacePicker = state ? (
		<ProjectPicker
			cwd={state.cwd}
			projects={state.projects ?? []}
			running={state.running}
			onOpen={(cwd) => onCommand({ type: "openProject", cwd })}
		/>
	) : null;
	const permissionPicker = state ? (
		<PermissionPicker
			mode={state.permissionMode ?? "review"}
			onSelect={(mode) => onCommand({ type: "setPermissionMode", mode })}
		/>
	) : null;
	const approvals = (
		<ApprovalList
			items={state?.pendingApprovals ?? []}
			onAllow={(id) => onCommand({ type: "approveTool", id })}
			onDeny={(id) => onCommand({ type: "denyTool", id })}
		/>
	);

	return (
		<main className={`workspace${empty ? " is-empty" : ""}`}>
			{empty ? null : (
				<header className="workspace-head">
					<div className="workspace-title">
						{line !== "live" ? <i className="dot" /> : null}
						<span>{state?.sessionTitle ?? "piruse"}</span>
					</div>
				</header>
			)}
			<div className="stage" ref={stageRef}>
				{empty ? (
					<div className="welcome">
						<h1>piruse, 我帮你</h1>
						{approvals}
						{notice ? <p className="notice">{notice}</p> : null}
						<Composer
							layout="welcome"
							running={Boolean(state?.running)}
							onSend={onSend}
							onAbort={() => onCommand({ type: "abort" })}
							autoFocus
							model={modelPicker}
							workspace={workspacePicker}
							permission={permissionPicker}
						/>
					</div>
				) : (
					<Thread items={state.items} />
				)}
			</div>
			{empty ? null : (
				<div className="dock">
					{notice ? <p className="notice">{notice}</p> : null}
					{approvals}
					<Composer
						layout="chat"
						running={state.running}
						onSend={onSend}
						onAbort={() => onCommand({ type: "abort" })}
						model={modelPicker}
						workspace={null}
						permission={permissionPicker}
					/>
					<p className="hint">内容由 AI 生成，请核实重要信息</p>
				</div>
			)}
		</main>
	);
}
