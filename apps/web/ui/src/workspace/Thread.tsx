import Markdown from "react-markdown";
import type { ViewItem } from "@protocol/view";

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
					<span className="assistant-avatar" aria-hidden="true">
						π
					</span>
					<div className="assistant-who">
						<div className="assistant-name">piruse</div>
						<div className="assistant-status">{item.streaming ? "正在回复…" : "已完成 ›"}</div>
					</div>
				</div>
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
