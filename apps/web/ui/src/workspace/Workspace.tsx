import { useEffect, useRef, useState } from "react";
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
	const [scrolledUp, setScrolledUp] = useState(false);

	const syncScrollFade = (): void => {
		const el = stageRef.current;
		if (!el) {
			setScrolledUp(false);
			return;
		}
		const fromEnd = el.scrollHeight - el.scrollTop - el.clientHeight;
		setScrolledUp(fromEnd > 16);
	};

	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
		syncScrollFade();
	}, [state?.items]);

	useEffect(() => {
		const el = stageRef.current;
		if (!el || empty) {
			setScrolledUp(false);
			return;
		}
		el.addEventListener("scroll", syncScrollFade, { passive: true });
		return () => el.removeEventListener("scroll", syncScrollFade);
	}, [empty]);

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
			onPick={() => onCommand({ type: "pickProject" })}
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
		<main className={`workspace${empty ? " is-empty" : ""}${scrolledUp ? " is-scrolled" : ""}`}>
			{empty ? null : (
				<header className="workspace-head">
					<div className="workspace-title">
						{line !== "live" ? <i className="dot" /> : null}
						<span>{state?.sessionTitle ?? "piruse"}</span>
					</div>
					{packagesLine(state?.packages) ? <p className="workspace-packages">{packagesLine(state?.packages)}</p> : null}
				</header>
			)}
			<div className="stage" ref={stageRef}>
				{empty ? (
					<div className="welcome">
						<h1>欢迎使用 Piruse，说说你想做什么</h1>
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
						<HintTicker />
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
					<HintTicker />
				</div>
			)}
		</main>
	);
}

const HINTS = [
	"一件事一个窗口，聊得越短它越清醒",
	"换话题了？开个新窗口吧",
	"事情办完就关掉，晾久了它会忘事",
	"开头就说清楚：要什么、有什么限制、怎样算做好",
	"告诉它在哪个文件，别让它满仓库乱翻",
	"要改的地方一次说完，省得来回跑好几趟",
	"报错直接贴给它，别让它自己去复现",
	"不想听解释，就说一句「只要结论」",
	"别让它把你刚说过的话再念一遍",
	"长文件只贴用得上的那几段",
	"日志贴报错前后几行就够了",
	"聊长了，先让它总结一句再开新窗口",
	"同样的事做第二遍，让它存成模板",
	"常用背景写进说明文件，省得每次重讲",
	"事情复杂，先让它出方案，你点头了再动手",
	"改完马上试一下，别攒到最后一起看",
] as const;

const HINT_ROTATE_MS = 3 * 60 * 1000;

function HintTicker() {
	const [index, setIndex] = useState(() => Math.floor(Date.now() / HINT_ROTATE_MS) % HINTS.length);

	useEffect(() => {
		let intervalId = 0;
		const alignMs = HINT_ROTATE_MS - (Date.now() % HINT_ROTATE_MS);
		const timeoutId = window.setTimeout(() => {
			setIndex(Math.floor(Date.now() / HINT_ROTATE_MS) % HINTS.length);
			intervalId = window.setInterval(() => {
				setIndex(Math.floor(Date.now() / HINT_ROTATE_MS) % HINTS.length);
			}, HINT_ROTATE_MS);
		}, alignMs);
		return () => {
			window.clearTimeout(timeoutId);
			window.clearInterval(intervalId);
		};
	}, []);

	return (
		<p className="hint" key={index} aria-live="polite">
			{HINTS[index]}
		</p>
	);
}

function packagesLine(status: ViewState["packages"] | undefined): string {
	if (!status) return "";
	const skills = status.skills.filter((item) => item.enabled).length;
	const extensions = status.extensions.filter((item) => item.enabled).length;
	const parts: string[] = [];
	if (skills > 0) parts.push(`技能 ${skills}`);
	if (extensions > 0) parts.push(`扩展 ${extensions}`);
	if (status.unsupported.length > 0) parts.push("部分 UI 未接入");
	const errors = status.diagnostics.filter((item) => item.level === "error").length;
	if (errors > 0) parts.push(`${errors} 个包加载失败`);
	return parts.join(" · ");
}
