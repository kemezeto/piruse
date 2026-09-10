import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { ViewItem, ViewState } from "@protocol/view";
import { ApprovalList, ModelPicker, PermissionPicker, ProjectPicker, SessionPicker } from "./Picker";
import { SettingsButton, SettingsDialog } from "./Settings";

type Line = "connecting" | "live" | "reconnecting";

export function App() {
	const [state, setState] = useState<ViewState | null>(null);
	const [notice, setNotice] = useState("");
	const [line, setLine] = useState<Line>("connecting");
	const [settingsOpen, setSettingsOpen] = useState(false);
	const socketRef = useRef<WebSocket | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let closed = false;
		let timer: number | undefined;
		const connect = (): void => {
			const protocol = location.protocol === "https:" ? "wss" : "ws";
			const socket = new WebSocket(`${protocol}://${location.host}/ws`);
			socketRef.current = socket;
			socket.onopen = () => {
				if (!closed) setLine("live");
			};
			socket.onmessage = (event) => {
				const message = JSON.parse(String(event.data)) as { type: string; state?: ViewState; text?: string };
				if (message.type === "state" && message.state) setState(message.state);
				if (message.type === "notice" && message.text) setNotice(message.text);
			};
			socket.onclose = () => {
				if (closed) return;
				setLine("reconnecting");
				timer = window.setTimeout(connect, 800);
			};
		};
		connect();
		return () => {
			closed = true;
			if (timer) window.clearTimeout(timer);
			socketRef.current?.close();
		};
	}, []);

	useEffect(() => {
		const el = stageRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [state?.items]);

	const empty = !state || state.items.length === 0;
	const projectName = state?.projects?.find((project) => project.cwd === state.cwd)?.name;
	const send = (text: string): void => {
		const socket = socketRef.current;
		if (!text.trim() || socket?.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify({ type: "prompt", text: text.trim() }));
		setNotice("");
	};
	const command = (payload: object): void => {
		const socket = socketRef.current;
		if (socket?.readyState !== WebSocket.OPEN) return;
		socket.send(JSON.stringify(payload));
		setNotice("");
	};
	const abort = (): void => {
		command({ type: "abort" });
	};

	return (
		<div className="app">
			<header className="topbar">
				<div className="brand">
					<span className="brand-mark">π</span>
					piruse
				</div>
				<div className="status">
					<i className={`dot${line === "live" ? " live" : ""}`} />
					{state ? (
						<>
							<ProjectPicker
								cwd={state.cwd}
								projects={state.projects ?? []}
								running={state.running}
								onOpen={(cwd) => command({ type: "openProject", cwd })}
							/>
							<SessionPicker
								currentId={state.sessionId}
								title={state.sessionTitle}
								sessions={state.sessions}
								running={state.running}
								onOpen={(sessionId) => command({ type: "openSession", sessionId })}
								onNew={() => command({ type: "newSession" })}
							/>
							<ModelPicker
								current={state.model}
								models={state.models}
								onSelect={(model) =>
									command({ type: "setModel", provider: model.provider, modelId: model.modelId })
								}
							/>
							<PermissionPicker
								mode={state.permissionMode ?? "review"}
								onSelect={(mode) => command({ type: "setPermissionMode", mode })}
							/>
						</>
					) : (
						<span>…</span>
					)}
				</div>
			</header>
			<div className="stage" ref={stageRef}>
				{empty ? (
					<div className="empty">
						<h1>Ask anything about {projectName ?? "this project"}</h1>
						<ApprovalList
							items={state?.pendingApprovals ?? []}
							onAllow={(id) => command({ type: "approveTool", id })}
							onDeny={(id) => command({ type: "denyTool", id })}
						/>
						<Composer running={Boolean(state?.running)} onSend={send} onAbort={abort} autoFocus />
						<p className="hint">Enter 发送 · Shift+Enter 换行 · 仅本机 127.0.0.1</p>
					</div>
				) : (
					<div className="column">
						<div className="thread">
							{state.items.map((item) => (
								<Item key={item.id} item={item} />
							))}
						</div>
					</div>
				)}
			</div>
			{notice ? <p className="notice">{notice}</p> : null}
			<SettingsButton onClick={() => setSettingsOpen(true)} />
			<SettingsDialog
				open={settingsOpen}
				providers={state?.providers ?? []}
				choices={state?.providerChoices ?? []}
				onClose={() => setSettingsOpen(false)}
				onCommand={command}
			/>
			{empty ? null : (
				<div className="dock">
					<ApprovalList
						items={state.pendingApprovals ?? []}
						onAllow={(id) => command({ type: "approveTool", id })}
						onDeny={(id) => command({ type: "denyTool", id })}
					/>
					<Composer running={state.running} onSend={send} onAbort={abort} />
					<p className="hint">Enter 发送 · Shift+Enter 换行 · 仅本机 127.0.0.1</p>
				</div>
			)}
		</div>
	);
}

function Item({ item }: { item: ViewItem }) {
	if (item.kind === "user") {
		return (
			<div className="turn user">
				<div className="bubble">{item.text}</div>
			</div>
		);
	}
	if (item.kind === "assistant") {
		return (
			<div className="turn assistant">
				<div className="kicker">{item.streaming ? "Working" : "piruse"}</div>
				<div className="md">
					<Markdown>{item.text || " "}</Markdown>
				</div>
			</div>
		);
	}
	if (item.kind === "tool") {
		return (
			<details
				className={`tool${item.running ? " running" : ""}${item.isError ? " is-error" : ""}`}
				open={item.running || Boolean(item.result)}
			>
				<summary>
					<span className="tool-name">{item.name}</span>
					<span className="tool-args">{item.args}</span>
				</summary>
				{item.result ? <pre>{item.result}</pre> : null}
			</details>
		);
	}
	return <div className="note">{item.text}</div>;
}

function Composer({
	running,
	onSend,
	onAbort,
	autoFocus = false,
}: {
	running: boolean;
	onSend: (text: string) => void;
	onAbort: () => void;
	autoFocus?: boolean;
}) {
	const [text, setText] = useState("");
	const canSend = useMemo(() => text.trim().length > 0 && !running, [text, running]);
	return (
		<form
			className="composer"
			onSubmit={(event) => {
				event.preventDefault();
				if (!canSend) return;
				onSend(text);
				setText("");
			}}
		>
			<textarea
				value={text}
				autoFocus={autoFocus}
				placeholder="Ask to inspect, edit, or run something…"
				rows={1}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						if (canSend) {
							onSend(text);
							setText("");
						}
					}
				}}
			/>
			<div className="actions">
				{running ? (
					<button type="button" className="icon-btn primary" title="Stop" aria-label="Stop" onClick={onAbort}>
						<StopIcon />
					</button>
				) : (
					<button type="submit" className="icon-btn primary" title="Send" aria-label="Send" disabled={!canSend}>
						<ArrowIcon />
					</button>
				)}
			</div>
		</form>
	);
}

function ArrowIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M8 3.2v9.6M4.2 7.1 8 3.2l3.8 3.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function StopIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
			<rect x="3" y="3" width="8" height="8" rx="1.2" />
		</svg>
	);
}
