import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { ChevronRightIcon } from "tdesign-icons-react";
import type { ViewItem } from "@protocol/view";
import logo from "../view/logo.png";

export function Thread({ items }: { items: ViewItem[] }) {
	return (
		<div className="column">
			<div className="thread">
				{items.map((item) => (
					<Item key={item.id} item={item} />
				))}
			</div>
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
		const thinkingLive = Boolean(item.thinkingStreaming);
		const hasThinking = thinkingLive || Boolean(item.thinking);
		const reply = Boolean(item.text) || (item.streaming && !thinkingLive);
		const status = thinkingLive ? "正在思考…" : item.streaming ? "正在回复…" : null;
		return (
			<div className="turn assistant">
				<div className="assistant-head">
					<img className="assistant-avatar" src={logo} alt="" />
					<div className="assistant-who">
						<div className="assistant-name">piruse</div>
						{status ? <div className="assistant-status">{status}</div> : null}
					</div>
				</div>
				{hasThinking ? (
					<ThinkingBlock
						text={item.thinking ?? ""}
						thinking={thinkingLive}
						turnStreaming={Boolean(item.streaming)}
					/>
				) : null}
				{reply ? (
					<div className="md">
						<Markdown>{item.text || " "}</Markdown>
					</div>
				) : null}
			</div>
		);
	}
	if (item.kind === "tool") {
		return <ToolCard item={item} />;
	}
	return <div className="note">{item.text}</div>;
}

function ThinkingBlock({
	text,
	thinking,
	turnStreaming,
}: {
	text: string;
	thinking: boolean;
	turnStreaming: boolean;
}) {
	const bodyRef = useRef<HTMLPreElement>(null);
	const [open, setOpen] = useState(thinking || turnStreaming);
	useEffect(() => {
		if (thinking) setOpen(true);
	}, [thinking]);
	useEffect(() => {
		if (!thinking && !turnStreaming) setOpen(false);
	}, [thinking, turnStreaming]);
	useEffect(() => {
		if (!open) return;
		bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
	}, [text, open]);
	const label = thinking ? "正在思考" : "思考";
	return (
		<div className={`thinking${thinking ? " streaming" : ""}${open ? " is-open" : ""}`}>
			<button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
				<span className="thinking-label">{label}</span>
				<ChevronRightIcon size={14} className="caret thinking-caret" aria-hidden="true" />
			</button>
			{open ? (
				<pre ref={bodyRef} className="thinking-body">
					{text || (thinking ? "…" : "")}
				</pre>
			) : null}
		</div>
	);
}

function ToolCard({ item }: { item: Extract<ViewItem, { kind: "tool" }> }) {
	const [open, setOpen] = useState(false);
	return (
		<details
			className={`tool${item.running ? " running" : ""}${item.isError ? " is-error" : ""}`}
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>
				<span className="tool-name">{item.name}</span>
				<span className="tool-args">{item.args}</span>
				<ChevronRightIcon size={16} className="caret tool-caret" aria-hidden="true" />
			</summary>
			{item.result ? (
				<div className="tool-body">
					<pre>{item.result}</pre>
				</div>
			) : null}
		</details>
	);
}
