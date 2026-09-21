import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon, TipsIcon } from "tdesign-icons-react";
import type { ViewItem } from "@protocol/view";
import { MarkdownBody } from "../markdown/MarkdownBody";
import logo from "../view/logo.png";

type ToolItem = Extract<ViewItem, { kind: "tool" }>;
type AssistantItem = Extract<ViewItem, { kind: "assistant" }>;

type ThreadBlock =
	| { kind: "user"; item: Extract<ViewItem, { kind: "user" }> }
	| { kind: "note"; item: Extract<ViewItem, { kind: "note" }> }
	| { kind: "agent"; items: Array<AssistantItem | ToolItem> };

export function Thread({ items }: { items: ViewItem[] }) {
	const blocks = groupThread(items);
	return (
		<div className="column">
			<div className="thread">
				{blocks.map((block) => {
					if (block.kind === "user") {
						return (
							<div className="turn user" key={block.item.id} data-turn={block.item.id}>
								<div className="bubble">{block.item.text}</div>
							</div>
						);
					}
					if (block.kind === "note") {
						return (
							<div className="note" key={block.item.id}>
								{block.item.text}
							</div>
						);
					}
					return <AgentTurn key={block.items[0]!.id} items={block.items} />;
				})}
			</div>
		</div>
	);
}

function AgentTurn({ items }: { items: Array<AssistantItem | ToolItem> }) {
	const status = agentStatus(items);
	const parts = streamParts(items);
	return (
		<div className="turn assistant">
			<div className="assistant-head">
				<img className="assistant-avatar" src={logo} alt="" />
				<div className="assistant-who">
					<div className="assistant-name">piruse</div>
					{status ? (
						<div className="assistant-status" aria-live="polite">
							{status}
						</div>
					) : null}
				</div>
			</div>
			<div className="agent-stream">
				{parts.map((part) =>
					part.kind === "work" ? (
						<WorkLog key={part.key} items={part.items} />
					) : (
						<Reply key={part.item.id} item={part.item} />
					),
				)}
			</div>
		</div>
	);
}

function WorkLog({ items }: { items: Array<AssistantItem | ToolItem> }) {
	const live = workLive(items);
	const [open, setOpen] = useState(live);
	useEffect(() => {
		setOpen(live);
	}, [live]);
	const duration = formatToolMs(workDurationMs(items));
	return (
		<div className={`work-log${open ? " is-open" : ""}${live ? " live" : ""}`}>
			{live ? null : (
				<button type="button" className="work-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
					<i className="tool-mark ok" aria-hidden="true" />
					<span className="work-label">{duration ? `已完成 ${duration}` : "已完成"}</span>
					<ChevronRightIcon size={14} className="caret work-caret" aria-hidden="true" />
				</button>
			)}
			{open ? (
				<div className="work-log-body">
					{items.map((item) =>
						item.kind === "tool" ? (
							<ToolRow key={item.id} item={item} />
						) : hasThinking(item) ? (
							<ThinkingBlock key={item.id} text={item.thinking ?? ""} thinking={Boolean(item.thinkingStreaming)} />
						) : null,
					)}
				</div>
			) : null}
		</div>
	);
}

function Reply({ item }: { item: AssistantItem }) {
	return (
		<div className={`md${item.streaming && !item.thinkingStreaming ? " streaming" : ""}`}>
			<MarkdownBody text={item.text || " "} />
		</div>
	);
}

function ThinkingBlock({ text, thinking }: { text: string; thinking: boolean }) {
	const bodyRef = useRef<HTMLPreElement>(null);
	const [open, setOpen] = useState(thinking);
	useEffect(() => {
		setOpen(thinking);
	}, [thinking]);
	useEffect(() => {
		if (!open) return;
		bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
	}, [text, open]);
	return (
		<div className={`thinking${thinking ? " streaming" : ""}${open ? " is-open" : ""}`}>
			<button type="button" className="thinking-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
				<TipsIcon size={14} className="thinking-icon" aria-hidden="true" />
				<span className="thinking-label">{thinking ? "正在思考" : "思考"}</span>
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

function ToolRow({ item }: { item: ToolItem }) {
	const [open, setOpen] = useState(false);
	const duration = formatToolMs(item.durationMs);
	const mark = item.running ? "spin" : item.isError ? "err" : "ok";
	return (
		<details
			className={`tool${item.running ? " running" : ""}${item.isError ? " is-error" : ""}`}
			data-tool={item.name}
			open={open}
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			<summary>
				<i className={`tool-mark ${mark}`} aria-hidden="true">
					{mark === "err" ? "×" : null}
				</i>
				<span className="tool-name">{toolVerb(item.name)}</span>
				{item.args ? <span className="tool-args">{previewArgs(item.args)}</span> : null}
				{duration && !item.running ? <span className="tool-dur">{duration}</span> : null}
				<ChevronRightIcon size={14} className="caret tool-caret" aria-hidden="true" />
			</summary>
			{open && item.result ? (
				<div className="tool-body">
					<pre>{item.result}</pre>
				</div>
			) : null}
		</details>
	);
}

function groupThread(items: ViewItem[]): ThreadBlock[] {
	const blocks: ThreadBlock[] = [];
	for (const item of items) {
		if (item.kind === "user") {
			blocks.push({ kind: "user", item });
			continue;
		}
		if (item.kind === "note") {
			blocks.push({ kind: "note", item });
			continue;
		}
		const last = blocks[blocks.length - 1];
		if (last?.kind === "agent") last.items.push(item);
		else blocks.push({ kind: "agent", items: [item] });
	}
	return blocks;
}

type StreamPart =
	| { kind: "work"; key: string; items: Array<AssistantItem | ToolItem> }
	| { kind: "reply"; item: AssistantItem };

function streamParts(items: Array<AssistantItem | ToolItem>): StreamPart[] {
	const parts: StreamPart[] = [];
	let work: Array<AssistantItem | ToolItem> = [];
	const flush = (): void => {
		if (work.length === 0) return;
		parts.push({ kind: "work", key: work[0]!.id, items: work });
		work = [];
	};
	for (const item of items) {
		if (item.kind === "tool") {
			work.push(item);
			continue;
		}
		if (hasThinking(item)) work.push(item);
		if (hasReply(item)) {
			flush();
			parts.push({ kind: "reply", item });
		}
	}
	flush();
	return parts;
}

function hasThinking(item: AssistantItem): boolean {
	return Boolean(item.thinkingStreaming) || Boolean(item.thinking);
}

function hasReply(item: AssistantItem): boolean {
	return Boolean(item.text) || (Boolean(item.streaming) && !item.thinkingStreaming);
}

function workLive(items: Array<AssistantItem | ToolItem>): boolean {
	return items.some(
		(item) => (item.kind === "tool" && item.running) || (item.kind === "assistant" && item.thinkingStreaming),
	);
}

function workDurationMs(items: Array<AssistantItem | ToolItem>): number | undefined {
	const points: number[] = [];
	let toolSum = 0;
	for (const item of items) {
		if (item.kind === "tool") toolSum += item.durationMs ?? 0;
		if (item.at == null) continue;
		points.push(item.at);
		if (item.kind === "tool" && item.durationMs != null) points.push(item.at - item.durationMs);
	}
	if (points.length >= 2) return Math.max(0, Math.max(...points) - Math.min(...points));
	return toolSum > 0 ? toolSum : undefined;
}

function agentStatus(items: Array<AssistantItem | ToolItem>): string | null {
	const running = [...items].reverse().find((item): item is ToolItem => item.kind === "tool" && item.running);
	if (running) return `${toolProgress(running.name)}…`;
	const streaming = [...items].reverse().find((item): item is AssistantItem => item.kind === "assistant" && Boolean(item.streaming));
	if (!streaming) return null;
	return streaming.thinkingStreaming ? "正在思考…" : "正在回复…";
}

const TOOL_VERBS: Record<string, { done: string; live: string }> = {
	read: { done: "读取", live: "正在读取" },
	write: { done: "写入", live: "正在写入" },
	edit: { done: "编辑", live: "正在编辑" },
	bash: { done: "执行", live: "正在执行" },
	grep: { done: "搜索", live: "正在搜索" },
	glob: { done: "查找", live: "正在查找" },
	subagent: { done: "委派", live: "正在委派" },
	task: { done: "委派", live: "正在委派" },
	web_search: { done: "搜索", live: "正在搜索" },
	fetch_content: { done: "获取", live: "正在获取" },
	get_search_content: { done: "读取结果", live: "正在读取结果" },
};

function toolVerb(name: string): string {
	return TOOL_VERBS[name]?.done ?? name;
}

function toolProgress(name: string): string {
	return TOOL_VERBS[name]?.live ?? `正在调用 ${name}`;
}

function formatToolMs(ms?: number): string | null {
	if (ms == null) return null;
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function previewArgs(args: string): string {
	const trimmed = args.trim();
	if (!trimmed.startsWith("{")) return args;
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return args;
		const record = parsed as Record<string, unknown>;
		if (typeof record.command === "string") return oneLine(record.command);
		if (typeof record.pattern === "string") {
			return oneLine([record.pattern, record.glob, record.path].filter((part): part is string => typeof part === "string").join(" "));
		}
		for (const key of ["query", "prompt", "description", "url", "path", "file", "glob", "name", "title"]) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) return oneLine(value);
		}
		for (const key of ["queries", "urls"]) {
			const value = record[key];
			if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) {
				return oneLine(value.join(", "));
			}
		}
	} catch {
		return args;
	}
	return args;
}

function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
