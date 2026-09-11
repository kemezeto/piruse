import { useMemo, useState } from "react";
import { ChevronDownIcon, FilterIcon, RefreshIcon } from "tdesign-icons-react";
import { Popup } from "tdesign-react";
import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { relativeTime } from "../format";
import { DateRangePicker } from "./DateRangePicker";
import { EChart } from "./EChart";
import { costTrendOption, costTreemapOption, formatUsd } from "./charts";
import { buildUsageStats, type AttrView, type TrendDim, type UsageDim, type UsageSlice } from "./usage";
import { resolveRange, todayShanghai, type OverviewRange } from "./range";

const TREND_DIMS: { id: TrendDim; label: string }[] = [
	{ id: "project", label: "项目" },
	{ id: "agent", label: "Agent" },
];

const ATTR_DIMS: { id: UsageDim; label: string }[] = [
	{ id: "project", label: "项目" },
	{ id: "model", label: "模型" },
	{ id: "agent", label: "Agent" },
];

const ATTR_VIEWS: { id: AttrView; label: string }[] = [
	{ id: "treemap", label: "矩形树图" },
	{ id: "list", label: "列表" },
];

const TOKEN_UNITS = ["Token"];

function formatCompact(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return Math.round(value).toLocaleString("en-US");
}

function formatDelta(delta: number): string {
	const pct = Math.abs(delta) * 100;
	const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
	return `${sign}${pct.toFixed(0)}%`;
}

export function Usage({ projects, models }: { projects: ViewProjectOption[]; models: ViewModelOption[] }) {
	const today = todayShanghai();
	const [range, setRange] = useState<OverviewRange>({ mode: "relative", preset: "30d" });
	const [unit, setUnit] = useState("Token");
	const [project, setProject] = useState("全部");
	const [agent, setAgent] = useState("全部");
	const [model, setModel] = useState("全部");
	const [updatedAt, setUpdatedAt] = useState(Date.now);
	const [trendDim, setTrendDim] = useState<TrendDim>("project");
	const [attrDim, setAttrDim] = useState<UsageDim>("project");
	const [attrView, setAttrView] = useState<AttrView>("treemap");
	const [hidden, setHidden] = useState<string[]>([]);

	const resolved = useMemo(() => resolveRange(range, today), [range, today]);
	const stats = useMemo(
		() => buildUsageStats(resolved, projects, models, { project, agent, model }),
		[resolved, projects, models, project, agent, model],
	);
	const trend = stats.trend[trendDim];
	const visibleTrend = useMemo(
		() => trend.slices.filter((item) => !hidden.includes(`${trendDim}:${item.name}`)),
		[trend.slices, hidden, trendDim],
	);
	const attrSlices = useMemo(
		() => stats.attribution[attrDim].filter((item) => !hidden.includes(`${attrDim}:${item.name}`)),
		[stats.attribution, attrDim, hidden],
	);
	const trendOption = useMemo(() => costTrendOption(trend.days, visibleTrend), [trend.days, visibleTrend]);
	const treeOption = useMemo(() => costTreemapOption(attrSlices), [attrSlices]);

	const projectNames = useMemo(() => ["全部", ...new Set(projects.map((item) => item.name))], [projects]);
	const modelNames = useMemo(() => ["全部", ...models.map((item) => item.name)], [models]);
	const agentNames = ["全部", "cursor", "coding", "analyse", "copilot"];

	function toggleHidden(dim: string, name: string): void {
		const key = `${dim}:${name}`;
		setHidden((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
	}

	return (
		<div className="ov">
			<div className="ov-toolbar">
				<div className="ov-toolbar-start">
					<button type="button" className="use-mode active">
						成本
					</button>
					<FilterMenu label="" value={unit} options={TOKEN_UNITS} onChange={setUnit} />
					<DateRangePicker range={range} today={today} onChange={setRange} />
					<FilterMenu icon label="项目" value={project} options={projectNames} onChange={setProject} />
					<FilterMenu icon label="Agent" value={agent} options={agentNames} onChange={setAgent} />
					<FilterMenu icon label="模型" value={model} options={modelNames} onChange={setModel} />
					<button type="button" className="ov-tool ghost" onClick={() => setUpdatedAt(Date.now())}>
						<RefreshIcon size={15} />
						<span>{relativeTime(updatedAt)}更新</span>
					</button>
				</div>
			</div>

			<div className="use-kpis">
				<article className="use-kpi active">
					<strong>{formatUsd(stats.totalCost)}</strong>
					<span>总成本</span>
					<em className={stats.delta <= 0 ? "down" : "up"}>较上一周期 {formatDelta(stats.delta)}</em>
				</article>
				<article className="use-kpi">
					<strong>{stats.credits}</strong>
					<span>Copilot AI Credits</span>
				</article>
				<article className="use-kpi">
					<strong>{formatCompact(stats.inputTokens)}</strong>
					<span>输入 Token</span>
					<em>+{formatCompact(stats.cachedTokens)} 已缓存</em>
				</article>
				<article className="use-kpi">
					<strong>{formatCompact(stats.outputTokens)}</strong>
					<span>输出 Token</span>
				</article>
				<article className="use-kpi">
					<strong>{formatUsd(stats.dailyAvg)}</strong>
					<span>每日消耗</span>
					<em>平均值</em>
				</article>
				<article className="use-kpi">
					<strong>{formatUsd(stats.peakCost)}</strong>
					<span>峰值日期</span>
					<em>{stats.peakDate}</em>
				</article>
				<article className="use-kpi">
					<strong>{(stats.cacheHit * 100).toFixed(1)}%</strong>
					<span>缓存命中</span>
				</article>
				<article className="use-kpi">
					<strong>{stats.projectCount}</strong>
					<span>项目</span>
				</article>
				<article className="use-kpi">
					<strong>{stats.modelCount}</strong>
					<span>模型</span>
				</article>
				<article className="use-kpi">
					<strong>{stats.activeDays}</strong>
					<span>活跃天数</span>
				</article>
			</div>

			<section className="ov-card">
				<div className="ov-card-head">
					<h2>成本趋势</h2>
					<div className="ov-pills" role="tablist" aria-label="趋势维度">
						{TREND_DIMS.map((item) => (
							<button
								key={item.id}
								type="button"
								role="tab"
								className={trendDim === item.id ? "active" : ""}
								onClick={() => {
									setTrendDim(item.id);
									setHidden([]);
								}}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
				<EChart className="ov-chart use-chart-trend" option={trendOption} />
				<div className="use-legend">
					{trend.slices.map((item) => {
						const off = hidden.includes(`${trendDim}:${item.name}`);
						return (
							<button
								key={item.name}
								type="button"
								className={off ? "off" : ""}
								onClick={() => toggleHidden(trendDim, item.name)}
							>
								<i style={{ background: item.color }} />
								{item.name}
							</button>
						);
					})}
				</div>
			</section>

			<section className="ov-card">
				<div className="ov-card-head wrap">
					<div>
						<h2>成本归因</h2>
						<p className="use-hint">点击可从图表中隐藏</p>
					</div>
					<div className="ov-filters">
						<div className="ov-pills" role="tablist" aria-label="归因维度">
							{ATTR_DIMS.map((item) => (
								<button
									key={item.id}
									type="button"
									role="tab"
									className={attrDim === item.id ? "active" : ""}
									onClick={() => {
										setAttrDim(item.id);
										setHidden([]);
									}}
								>
									{item.label}
								</button>
							))}
						</div>
						<div className="ov-pills" role="tablist" aria-label="归因视图">
							{ATTR_VIEWS.map((item) => (
								<button
									key={item.id}
									type="button"
									role="tab"
									className={attrView === item.id ? "active" : ""}
									onClick={() => setAttrView(item.id)}
								>
									{item.label}
								</button>
							))}
						</div>
					</div>
				</div>
				{attrView === "treemap" ? (
					<div className="use-attr">
						<EChart className="ov-chart use-chart-tree" option={treeOption} />
						<RankList
							slices={stats.attribution[attrDim]}
							hidden={hidden}
							dim={attrDim}
							onToggle={toggleHidden}
						/>
					</div>
				) : (
					<RankList
						slices={stats.attribution[attrDim]}
						hidden={hidden}
						dim={attrDim}
						onToggle={toggleHidden}
						wide
					/>
				)}
			</section>
		</div>
	);
}

function RankList({
	slices,
	hidden,
	dim,
	onToggle,
	wide,
}: {
	slices: UsageSlice[];
	hidden: string[];
	dim: string;
	onToggle: (dim: string, name: string) => void;
	wide?: boolean;
}) {
	return (
		<ol className={`use-rank${wide ? " wide" : ""}`}>
			{slices.map((item, index) => {
				const off = hidden.includes(`${dim}:${item.name}`);
				return (
					<li key={item.name}>
						<button type="button" className={off ? "off" : ""} onClick={() => onToggle(dim, item.name)}>
							<span className="use-rank-n">{index + 1}</span>
							<i style={{ background: item.color }} />
							<strong>{item.name}</strong>
							<em>{formatUsd(item.cost)}</em>
						</button>
					</li>
				);
			})}
		</ol>
	);
}

function FilterMenu({
	label,
	value,
	options,
	onChange,
	icon,
}: {
	label: string;
	value: string;
	options: string[];
	onChange: (value: string) => void;
	icon?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const names = options.length > 0 ? options : [value];
	return (
		<Popup
			visible={open}
			trigger="click"
			placement="bottom-left"
			delay={0}
			destroyOnClose
			overlayInnerClassName="popover"
			content={
				<div className="popover-list" role="listbox" aria-label={label || "选项"}>
					{names.map((name) => (
						<button
							key={name}
							type="button"
							role="option"
							aria-selected={value === name}
							className={`popover-item${value === name ? " active" : ""}`}
							onClick={() => {
								onChange(name);
								setOpen(false);
							}}
						>
							<span className="popover-item-title">{name}</span>
						</button>
					))}
				</div>
			}
			onVisibleChange={setOpen}
		>
			<button type="button" className={`ov-tool${open ? " open" : ""}`}>
				{icon ? <FilterIcon size={15} /> : null}
				<span>{label ? `${label}: ${value}` : value}</span>
				<ChevronDownIcon size={14} />
			</button>
		</Popup>
	);
}
