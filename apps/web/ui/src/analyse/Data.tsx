import { useMemo, useState } from "react";
import type { AnalyseSnapshot } from "@protocol/analyse";
import { formatUsd } from "./charts";
import { formatClock, formatDur, formatTokens } from "./session-inspect";

export function DataTable({ snapshot }: { snapshot: AnalyseSnapshot | null }) {
	const [query, setQuery] = useState("");
	const rows = useMemo(() => {
		const sessions = snapshot?.sessions ?? [];
		const needle = query.trim().toLowerCase();
		if (!needle) return sessions;
		return sessions.filter((session) =>
			`${session.title} ${session.project} ${session.model}`.toLowerCase().includes(needle),
		);
	}, [snapshot, query]);

	if (!snapshot) {
		return (
			<div className="sess sess-empty">
				<p>正在读取本机会话账本…</p>
			</div>
		);
	}

	return (
		<div className="ov">
			<div className="ov-toolbar">
				<div className="ov-toolbar-start">
					<input
						className="ov-tool"
						value={query}
						placeholder="搜索标题、项目、模型"
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				<span className="ov-muted">{rows.length} 个会话</span>
			</div>
			<section className="ov-card">
				<div className="ov-card-head">
					<h2>会话账本</h2>
					<span className="ov-muted">来自 ~/.piruse/sessions，不含演示数据</span>
				</div>
				<div className="act-table-wrap">
					<table className="act-table">
						<thead>
							<tr>
								<th>会话</th>
								<th>项目</th>
								<th>模型</th>
								<th className="num">消息</th>
								<th className="num">输出 token</th>
								<th className="num">成本</th>
								<th className="num">工具</th>
								<th className="num">时长</th>
								<th>开始</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((session) => (
								<tr key={session.id}>
									<td>
										{session.aborted ? <i className="ov-dot" /> : null}
										{session.title}
									</td>
									<td>{session.project}</td>
									<td>{session.model || "—"}</td>
									<td className="num">{session.messages}</td>
									<td className="num">{formatTokens(session.usage.output)}</td>
									<td className="num">{formatUsd(session.usage.cost)}</td>
									<td className="num">{session.toolCalls}</td>
									<td className="num">{session.durationMin > 0 ? formatDur(session.durationMin * 60_000) : "—"}</td>
									<td>{formatClock(session.startedAt)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
