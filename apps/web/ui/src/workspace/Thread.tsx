import { useEffect, useState } from "react";
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
		return (
			<div className="turn assistant">
				<div className="assistant-head">
					<img className="assistant-avatar" src={logo} alt="" />
					<div className="assistant-who">
						<div className="assistant-name">piruse</div>
						{item.streaming ? <div className="assistant-status">正在回复…</div> : null}
					</div>
				</div>
				<div className="md">
					<Markdown>{item.text || " "}</Markdown>
				</div>
			</div>
		);
	}
	if (item.kind === "tool") {
		return <ToolCard item={item} />;
	}
	return <div className="note">{item.text}</div>;
}

function ToolCard({ item }: { item: Extract<ViewItem, { kind: "tool" }> }) {
	const [open, setOpen] = useState(item.running || Boolean(item.result));
	useEffect(() => {
		if (item.running) setOpen(true);
	}, [item.running]);
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
