import { useMemo, useState } from "react";
import { ChevronRightIcon, CloseIcon, SearchIcon } from "tdesign-icons-react";
import { MarkdownBody } from "../markdown/MarkdownBody";
import type { ViewItem, ViewProjectOption } from "@protocol/view";
import { basenameOf } from "../format";
import {
	formatClock,
	formatDur,
	formatTokens,
	groupTurns,
	matchesQuery,
	roundStats,
	sessionMetrics,
	shortArgs,
	timelineEvents,
	type InspectTurn,
	type TimelineEvent,
} from "./session-inspect";

export function SessionInspect({
	sessionId,
	sessionTitle,
	cwd,
	items,
	projects,
	onOpenInCoding,
}: {
	sessionId: string;
	sessionTitle: string;
	cwd: string;
	items: ViewItem[];
	projects: ViewProjectOption[];
	onOpenInCoding: () => void;
}) {
	const [query, setQuery] = useState("");
	const [searchOpen, setSearchOpen] = useState(false);
	const [scale, setScale] = useState<"ratio" | "order">("ratio");
	const [chain, setChain] = useState<"turn" | "round">("turn");
	const [panel, setPanel] = useState(true);
	const visible = useMemo(
		() => (query.trim() ? items.filter((item) => matchesQuery(item, query.trim())) : items),
		[items, query],
	);
	const turns = useMemo(() => groupTurns(visible), [visible]);
	const metrics = useMemo(() => sessionMetrics(items), [items]);
	const tools = useMemo(
		() => items.filter((item): item is Extract<ViewItem, { kind: "tool" }> => item.kind === "tool"),
		[items],
	);
	const events = useMemo(() => timelineEvents(items), [items]);
	const rounds = useMemo(() => roundStats(groupTurns(items)), [items]);
	const project = projects.find((item) => item.cwd === cwd)?.name ?? basenameOf(cwd);
	const hash = sessionId.slice(0, 7);
	const otherMs = Math.max(0, metrics.durationMs - metrics.toolMs);

	if (!sessionId) {
		return (
			<div className="sess sess-empty">
				<p>在左侧选择一场对话，查看它的过程、工具调用和耗时。</p>
			</div>
		);
	}

	return (
		<div className={`sess${panel ? "" : " no-panel"}`}>
			<header className="sess-head">
				<div className="sess-head-start">
					<span className="sess-kicker">会话</span>
					<h1>{sessionTitle || "未命名对话"}</h1>
					<time>{formatClock(metrics.startedAt)}</time>
					<em title="输出 Token">{formatTokens(metrics.tokens)}</em>
					<button type="button" className="sess-open" onClick={onOpenInCoding}>
						打开
					</button>
					<button
						type="button"
						className="sess-hash"
						title={`${sessionId}（点击复制）`}
						onClick={() => void navigator.clipboard.writeText(sessionId)}
					>
						{hash}
					</button>
				</div>
				<div className="sess-head-end">
					{searchOpen ? (
						<input
							className="sess-search"
							value={query}
							placeholder="搜索消息或工具"
							autoFocus
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									setQuery("");
									setSearchOpen(false);
								}
							}}
						/>
					) : null}
					<button
						type="button"
						className="sess-icon"
						aria-label="搜索"
						aria-pressed={searchOpen}
						onClick={() => {
							setSearchOpen((open) => !open);
							if (searchOpen) setQuery("");
						}}
					>
						<SearchIcon size={16} />
					</button>
					{panel ? null : (
						<button type="button" className="sess-open" onClick={() => setPanel(true)}>
							分析
						</button>
					)}
				</div>
			</header>
			<div className="sess-body">
				<div className="sess-thread">
					<div className="sess-thread-inner">
						{items.length === 0 ? (
							<p className="sess-blank">这场对话还没有消息。</p>
						) : turns.length === 0 ? (
							<p className="sess-blank">没有匹配的消息。</p>
						) : (
							turns.map((turn) => <Turn key={turn.id} turn={turn} />)
						)}
					</div>
				</div>
				{panel ? (
					<aside className="sess-panel" aria-label="分析">
						<div className="sess-panel-head">
							<div>
								<strong>分析</strong>
								<span>会话指标</span>
							</div>
							<button type="button" className="sess-icon" aria-label="关闭分析" onClick={() => setPanel(false)}>
								<CloseIcon size={14} />
							</button>
						</div>
						<div className="sess-panel-body">
						<dl className="sess-stats">
							<div>
								<dt>会话</dt>
								<dd>{formatDur(metrics.durationMs)}</dd>
							</div>
							<div>
								<dt>工作区</dt>
								<dd>{project || "—"}</dd>
							</div>
							<div className="wide">
								<dt>路径</dt>
								<dd title={cwd}>{cwd || "—"}</dd>
							</div>
						</dl>
						<div className="sess-pair">
							<div>
								<span>工具调用</span>
								<strong>{metrics.toolCount}</strong>
							</div>
							<div>
								<span>工具耗时</span>
								<strong>{formatDur(metrics.toolMs)}</strong>
							</div>
						</div>
						<div className="sess-last">
							<span>最后调用</span>
							{metrics.lastTool ? (
								<p>
									<code>{metrics.lastTool.name}</code>
									<em>{formatDur(metrics.lastTool.durationMs)}</em>
									<b>{metrics.toolCount}</b>
								</p>
							) : (
								<p>无</p>
							)}
						</div>
						<div className="sess-block">
							<span>SUB-AGENTS</span>
							<strong>{metrics.subagents}</strong>
						</div>
						<div className="sess-block">
							<div className="sess-block-row">
								<span>记忆</span>
								<strong>0</strong>
							</div>
							<p>此会话没有提取记忆。</p>
						</div>
						<div className="sess-block">
							<div className="sess-block-head">
								<span>延伸分析</span>
								<div className="sess-toggle">
									<button type="button" className={scale === "ratio" ? "active" : ""} onClick={() => setScale("ratio")}>
										按比例尺
									</button>
									<button type="button" className={scale === "order" ? "active" : ""} onClick={() => setScale("order")}>
										按时间顺序
									</button>
								</div>
							</div>
							<LaneChart events={events} mode={scale} otherMs={otherMs} toolMs={metrics.toolMs} />
						</div>
						<div className="sess-block">
							<div className="sess-block-head">
								<span>调用链</span>
								<div className="sess-toggle">
									<button type="button" className={chain === "turn" ? "active" : ""} onClick={() => setChain("turn")}>
										回合
									</button>
									<button type="button" className={chain === "round" ? "active" : ""} onClick={() => setChain("round")}>
										轮次
									</button>
								</div>
							</div>
							<ChainChart events={events} rounds={rounds} mode={chain} />
						</div>
						<div className="sess-block sess-calls-block">
							<div className="sess-block-row">
								<span>调用</span>
								<strong>{tools.length}</strong>
							</div>
							<ol className="sess-calls">
								{tools.map((item) => {
									const max = Math.max(1, ...tools.map((tool) => tool.durationMs ?? 0));
									const width = ((item.durationMs ?? 0) / max) * 100;
									return (
										<li key={item.id}>
											<code title={item.args}>{item.name}</code>
											<i style={{ width: `${Math.max(width, 1.5)}%` }} />
											<em>{formatDur(item.durationMs ?? 0)}</em>
										</li>
									);
								})}
							</ol>
						</div>
						</div>
					</aside>
				) : null}
			</div>
		</div>
	);
}

function Turn({ turn }: { turn: InspectTurn }) {
	if (turn.kind === "user") {
		return (
			<article className="sess-card sess-user">
				<header>
					<span className="sess-who">
						<i>U</i>
						<b>用户</b>
					</span>
					<time>{formatClock(turn.at)}</time>
				</header>
				<p>{turn.text}</p>
			</article>
		);
	}
	if (turn.kind === "assistant") {
		return (
			<article className="sess-card sess-assistant">
				<header>
					<span className="sess-who">
						<i>A</i>
						<b>助手</b>
					</span>
					<time>{formatClock(turn.at)}</time>
				</header>
				<div className="md">
					<MarkdownBody text={turn.text || " "} />
				</div>
			</article>
		);
	}
	if (turn.kind === "note") {
		return <p className="sess-note">{turn.text}</p>;
	}
	return <ToolGroup items={turn.items} at={turn.at} />;
}

function ToolGroup({ items, at }: { items: Extract<ViewItem, { kind: "tool" }>[]; at?: number }) {
	const [open, setOpen] = useState(true);
	return (
		<article className={`sess-card sess-tools${open ? " open" : ""}`}>
			<button type="button" className="sess-tools-toggle" onClick={() => setOpen((value) => !value)}>
				<span className="sess-who">
					<b>
						{items.length}次 tool call
						<ChevronRightIcon size={14} className={`caret${open ? " open" : ""}`} />
					</b>
				</span>
				<time>{formatClock(at)}</time>
			</button>
			{open ? (
				<ul className="sess-tool-list">
					{items.map((item) => (
						<li key={item.id}>
							<div>
								<code>{item.name}</code>
								{item.args ? <span>{shortArgs(item.args)}</span> : null}
							</div>
							<em>{formatDur(item.durationMs ?? 0)}</em>
						</li>
					))}
				</ul>
			) : null}
		</article>
	);
}

function LaneChart({
	events,
	mode,
	otherMs,
	toolMs,
}: {
	events: TimelineEvent[];
	mode: "ratio" | "order";
	otherMs: number;
	toolMs: number;
}) {
	return (
		<div className="sess-lanes">
			<LaneRow label="Other" kind="other" events={events} mode={mode} total={formatDur(otherMs)} />
			<LaneRow label="Tool" kind="tool" events={events} mode={mode} total={formatDur(toolMs)} />
		</div>
	);
}

function LaneRow({
	label,
	kind,
	events,
	mode,
	total,
}: {
	label: string;
	kind: "other" | "tool";
	events: TimelineEvent[];
	mode: "ratio" | "order";
	total: string;
}) {
	const t0 = events[0]?.start ?? 0;
	const t1 = Math.max(t0 + 1, ...events.map((event) => event.end));
	const span = Math.max(1, t1 - t0);
	return (
		<div className="sess-lane">
			<span>{label}</span>
			<div className="sess-lane-track">
				{events.map((event, index) => {
					if (event.kind !== kind) return null;
					const left = mode === "order" ? (index / Math.max(events.length, 1)) * 100 : ((event.start - t0) / span) * 100;
					const width =
						mode === "order"
							? 100 / Math.max(events.length, 1)
							: (Math.max(event.end - event.start, 1) / span) * 100;
					return (
						<i
							key={event.id}
							className={kind}
							title={`${event.label} ${formatDur(event.end - event.start)}`}
							style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
						/>
					);
				})}
			</div>
			<em>{total}</em>
		</div>
	);
}

function ChainChart({
	events,
	rounds,
	mode,
}: {
	events: TimelineEvent[];
	rounds: ReturnType<typeof roundStats>;
	mode: "turn" | "round";
}) {
	if (mode === "round") {
		const max = Math.max(1, ...rounds.map((item) => item.toolMs + item.otherMs));
		return (
			<div className="sess-chain">
				<div className="sess-chain-bars">
					{rounds.map((item) => (
						<i
							key={item.id}
							title={`${item.tools} 次调用 ${formatDur(item.toolMs)}`}
							style={{ height: `${Math.max(12, ((item.toolMs + item.otherMs) / max) * 100)}%` }}
						/>
					))}
				</div>
			</div>
		);
	}
	const t0 = events[0]?.start ?? 0;
	const t1 = Math.max(t0 + 1, ...events.map((event) => event.end));
	const span = Math.max(1, t1 - t0);
	return (
		<div className="sess-chain">
			<div className="sess-lane-track sess-chain-track">
				{events.map((event) => {
					const left = ((event.start - t0) / span) * 100;
					const width = (Math.max(event.end - event.start, 1) / span) * 100;
					return (
						<i
							key={event.id}
							className={event.kind}
							title={`${event.label} ${formatDur(event.end - event.start)}`}
							style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
						/>
					);
				})}
			</div>
		</div>
	);
}
