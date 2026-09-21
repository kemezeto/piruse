import { useMemo, useState } from "react";
import { RefreshIcon } from "tdesign-icons-react";
import type { AnalyseSnapshot } from "@protocol/analyse";
import { relativeTime } from "../format";
import { healthTrendOption } from "./charts";
import { DateRangePicker } from "./DateRangePicker";
import { EChart } from "./EChart";
import {
	buildQualityStats,
	GRADE_COLOR,
	type QualityGroup,
} from "./quality";
import { resolveRange, todayShanghai, type OverviewRange } from "./range";

function formatPct(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatScore(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

export function Quality({ snapshot, onReload }: { snapshot: AnalyseSnapshot | null; onReload: () => void }) {
	const today = todayShanghai();
	const [range, setRange] = useState<OverviewRange>({ mode: "relative", preset: "1y" });
	const resolved = useMemo(() => resolveRange(range, today), [range, today]);
	const stats = useMemo(() => buildQualityStats(resolved, snapshot?.sessions ?? []), [resolved, snapshot]);
	const trend = useMemo(() => healthTrendOption(stats.days), [stats.days]);
	const gradeMax = Math.max(1, ...stats.grades.map((item) => item.count));
	const outcomeTotal = Math.max(1, stats.outcomes.reduce((sum, item) => sum + item.count, 0));

	return (
		<div className="ov">
			<div className="ov-toolbar">
				<div className="ov-toolbar-start">
					<DateRangePicker range={range} today={today} onChange={setRange} />
					<button type="button" className="ov-tool ghost" onClick={onReload}>
						<RefreshIcon size={15} />
						<span>{relativeTime(snapshot?.generatedAt ?? Date.now())}更新</span>
					</button>
				</div>
			</div>

			<div className="q-kpis">
				<article className="q-kpi">
					<span>完成率</span>
					<strong>{formatPct(stats.completedRate)}</strong>
					<em>等级 {stats.grade}</em>
				</article>
				<article className="q-kpi">
					<span>已完成</span>
					<strong className="ok">{formatPct(stats.completedRate)}</strong>
					<em>{stats.completedCount} 个会话</em>
				</article>
				<article className="q-kpi">
					<span>出错</span>
					<strong className="bad">{formatPct(stats.errorRate)}</strong>
					<em>{stats.errorCount} 个会话</em>
				</article>
				<article className="q-kpi">
					<span>TOOL 失败</span>
					<strong className="warn">{formatPct(stats.toolFailRate)}</strong>
					<em>{stats.toolFailCount} 个会话</em>
				</article>
				<article className="q-kpi">
					<span>压缩</span>
					<strong className="warn">{stats.compaction}</strong>
					<em>平均 {stats.compactionPerSession.toFixed(1)}/会话</em>
				</article>
			</div>

			<div className="q-split">
				<section className="ov-card">
					<div className="ov-card-head">
						<h2>等级分布</h2>
					</div>
					<div className="q-grades">
						{stats.grades.map((item) => (
							<div key={item.grade} className="q-grade">
								<span className="q-grade-id">{item.grade}</span>
								<div className="q-grade-track">
									<i
										style={{
											width: `${(item.count / gradeMax) * 100}%`,
											background: GRADE_COLOR[item.grade],
										}}
									/>
								</div>
								<span className="q-grade-n">{item.count}</span>
							</div>
						))}
					</div>
				</section>
				<section className="ov-card">
					<div className="ov-card-head">
						<h2>结果分布</h2>
					</div>
					<div className="q-outcomes">
						<div className="q-outcome-bar" role="img" aria-label="结果分布">
							{stats.outcomes.map((item) => (
								<i
									key={item.id}
									style={{ flexGrow: item.count / outcomeTotal, background: item.color }}
									title={`${item.label} ${item.count}`}
								/>
							))}
						</div>
						<div className="q-outcome-legend">
							{stats.outcomes.map((item) => (
								<span key={item.id}>
									<i style={{ background: item.color }} />
									{item.label} {item.count}
								</span>
							))}
						</div>
					</div>
				</section>
			</div>

			<section className="ov-card">
				<div className="ov-card-head">
					<h2>健康度趋势</h2>
				</div>
				<EChart className="ov-chart q-chart-trend" option={trend} />
				<p className="q-caption">按会话结果估算的操作健康度，不是模型打分</p>
			</section>

			<GroupTable title="按项目" nameLabel="项目" rows={stats.projects} />
		</div>
	);
}

function GroupTable({ title, nameLabel, rows }: { title: string; nameLabel: string; rows: QualityGroup[] }) {
	return (
		<section className="ov-card">
			<div className="ov-card-head">
				<h2>{title}</h2>
			</div>
			<div className="act-table-wrap">
				<table className="act-table q-table">
					<thead>
						<tr>
							<th>{nameLabel}</th>
							<th className="num">会话</th>
							<th className="num">健康度</th>
							<th className="num">已完成</th>
						</tr>
					</thead>
					<tbody>
						{rows.slice(0, 10).map((item) => (
							<tr key={item.name}>
								<td>{item.name}</td>
								<td className="num">{item.sessions}</td>
								<td className="num">{formatScore(item.avgScore)}</td>
								<td className="num">{formatPct(item.completed)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
