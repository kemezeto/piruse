import { EChart } from "./EChart";
import { toolWeekOption } from "./charts";
import type { ToolCategoryStat, ToolStat, WeekPoint } from "./demo";

function formatInt(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function formatPct(share: number): string {
	const pct = share * 100;
	return `${pct >= 10 ? pct.toFixed(1) : pct >= 1 ? pct.toFixed(1) : pct.toFixed(1)}%`;
}

export function ToolUsage({
	tools,
	categories,
	weeks,
	total,
}: {
	tools: ToolStat[];
	categories: ToolCategoryStat[];
	weeks: WeekPoint[];
	total: number;
}) {
	const hot = tools.slice(0, 8);
	const option = toolWeekOption(weeks);
	return (
		<section className="ov-card">
			<div className="ov-card-head">
				<h2>Tool 使用</h2>
				<span className="ov-muted">{formatInt(total)} 次调用</span>
			</div>
			<p className="ov-kicker">热门 TOOL</p>
			<ul className="ov-tool-hot">
				{hot.map((item, index) => (
					<li key={item.name}>
						<span className="ov-hot-n">{index + 1}</span>
						<i className="ov-swatch" style={{ background: item.color }} />
						<strong>{item.name}</strong>
						<span className="ov-dim">{item.category}</span>
						<span className="ov-num">{formatInt(item.calls)}</span>
						<span className="ov-dim">{item.sessions} 个会话</span>
						<span className="ov-dim">{formatPct(item.share)}</span>
					</li>
				))}
			</ul>
			<p className="ov-kicker">按类别</p>
			<ul className="ov-cats">
				{categories.map((item) => (
					<li key={item.name}>
						<span className="ov-cat-name">{item.name}</span>
						<div className="ov-track">
							<i style={{ width: `${Math.max(1.2, item.share * 100)}%`, background: item.color }} />
						</div>
						<span className="ov-num">{formatInt(item.calls)}</span>
						<span className="ov-dim">{formatPct(item.share)}</span>
					</li>
				))}
			</ul>
			<p className="ov-kicker">周趋势</p>
			<EChart className="ov-chart ov-chart-week" option={option} />
		</section>
	);
}
