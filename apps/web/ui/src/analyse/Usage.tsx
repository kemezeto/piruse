import { useMemo, useState } from "react";
import { ChevronDownIcon, FilterIcon, RefreshIcon } from "tdesign-icons-react";
import { Popup } from "tdesign-react";
import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { relativeTime } from "../format";
import { DateRangePicker } from "./DateRangePicker";
import { EChart } from "./EChart";
import { costTrendOption, costTreemapOption, formatCompactToken, formatUsd, type UsageValueKind } from "./charts";
import {
	buildUsageStats,
	scaleMetric,
	tokenTotal,
	type AttrView,
	type TokenKind,
	type TrendDim,
	type UsageDim,
	type UsageMode,
	type UsageSlice,
} from "./usage";
import { resolveRange, todayShanghai, type OverviewRange } from "./range";

const MODES: { id: UsageMode; label: string }[] = [
	{ id: "cost", label: "成本" },
	{ id: "token", label: "Token" },
];

const TOKEN_KINDS: { id: TokenKind; label: string }[] = [
	{ id: "all", label: "全部" },
	{ id: "input", label: "输入" },
	{ id: "output", label: "输出" },
	{ id: "cache", label: "缓存" },
];

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

function formatDelta(delta: number): string {
	const pct = Math.abs(delta) * 100;
	const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
	return `${sign}${pct.toFixed(0)}%`;
}

function peakOf(days: { date: string; total: number }[], fallback: string): { value: number; date: string } {
	let value = 0;
	let date = fallback;
	for (const day of days) {
		if (day.total >= value) {
			value = day.total;
			date = day.date;
		}
	}
	return { value, date };
}

export function Usage({ projects, models }: { projects: ViewProjectOption[]; models: ViewModelOption[] }) {
	const today = todayShanghai();
	const [range, setRange] = useState<OverviewRange>({ mode: "relative", preset: "30d" });
	const [mode, setMode] = useState<UsageMode>("cost");
	const [tokenKind, setTokenKind] = useState<TokenKind>("all");
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
	const kind: UsageValueKind = mode === "cost" ? "usd" : "token";
	const scale = useMemo(() => {
		if (mode === "cost" || stats.totalCost === 0) return 1;
		return tokenTotal(stats, tokenKind) / stats.totalCost;
	}, [mode, stats, tokenKind]);
	const trend = stats.trend[trendDim];
	const visibleTrend = useMemo(
		() => trend.slices.filter((item) => !hidden.includes(`${trendDim}:${item.name}`)),
		[trend.slices, hidden, trendDim],
	);
	const attrSlices = useMemo(
		() => stats.attribution[attrDim].filter((item) => !hidden.includes(`${attrDim}:${item.name}`)),
		[stats.attribution, attrDim, hidden],
	);
	const scaledTrend = useMemo(
		() => scaleMetric(trend.days, visibleTrend, scale),
		[trend.days, visibleTrend, scale],
	);
	const scaledAttr = useMemo(() => scaleMetric([], attrSlices, scale).slices, [attrSlices, scale]);
	const scaledAttrAll = useMemo(
		() => scaleMetric([], stats.attribution[attrDim], scale).slices,
		[stats.attribution, attrDim, scale],
	);
	const trendOption = useMemo(
		() => costTrendOption(scaledTrend.days, scaledTrend.slices, kind),
		[scaledTrend, kind],
	);
	const treeOption = useMemo(() => costTreemapOption(scaledAttr, kind), [scaledAttr, kind]);
	const tokenPeak = useMemo(() => peakOf(scaledTrend.days, resolved.start), [scaledTrend.days, resolved.start]);
	const selectedTokens = tokenTotal(stats, tokenKind);
	const totalTokens = tokenTotal(stats);
	const tokenKindLabel = TOKEN_KINDS.find((item) => item.id === tokenKind)?.label ?? "全部";

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
					<div className="use-switch" role="tablist" aria-label="用量单位">
						{MODES.map((item) => (
							<button
								key={item.id}
								type="button"
								role="tab"
								aria-selected={mode === item.id}
								className={mode === item.id ? "active" : ""}
								onClick={() => setMode(item.id)}
							>
								{item.label}
							</button>
						))}
					</div>
					{mode === "token" ? (
						<FilterMenu
							icon
							label="Token 类型"
							value={tokenKindLabel}
							options={TOKEN_KINDS.map((item) => item.label)}
							onChange={(label) => {
								setTokenKind(TOKEN_KINDS.find((item) => item.label === label)?.id ?? "all");
							}}
						/>
					) : null}
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

			<div className={`use-kpis${mode === "token" ? " tokens" : ""}`}>
				{mode === "cost" ? (
					<>
						<article className="use-kpi active">
							<strong>{formatUsd(stats.totalCost)}</strong>
							<span>总成本</span>
							<em className={stats.delta <= 0 ? "down" : "up"}>较上一周期 {formatDelta(stats.delta)}</em>
						</article>
						<article className="use-kpi">
							<strong>{stats.credits}</strong>
							<span>Copilot AI Credits</span>
						</article>
					</>
				) : (
					<article className="use-kpi active">
						<strong>{formatCompactToken(tokenKind === "all" ? totalTokens : selectedTokens)}</strong>
						<span>{tokenKind === "all" ? "总 Token" : `${tokenKindLabel} Token`}</span>
						<em>+{formatCompactToken(stats.cachedTokens)} 已缓存</em>
					</article>
				)}
				<article className="use-kpi">
					<strong>{formatCompactToken(stats.inputTokens)}</strong>
					<span>输入 Token</span>
					<em>+{formatCompactToken(stats.cachedTokens)} 已缓存</em>
				</article>
				<article className="use-kpi">
					<strong>{formatCompactToken(stats.outputTokens)}</strong>
					<span>输出 Token</span>
				</article>
				<article className="use-kpi">
					<strong>
						{mode === "cost"
							? formatUsd(stats.dailyAvg)
							: formatCompactToken(selectedTokens / Math.max(1, stats.activeDays))}
					</strong>
					<span>每日消耗</span>
					<em>平均值</em>
				</article>
				<article className="use-kpi">
					<strong>{mode === "cost" ? formatUsd(stats.peakCost) : formatCompactToken(tokenPeak.value)}</strong>
					<span>峰值日期</span>
					<em>{mode === "cost" ? stats.peakDate : tokenPeak.date}</em>
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
					<h2>{mode === "cost" ? "成本趋势" : "Token 趋势"}</h2>
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
						<h2>{mode === "cost" ? "成本归因" : "Token 归因"}</h2>
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
							values={scaledAttrAll}
							hidden={hidden}
							dim={attrDim}
							kind={kind}
							onToggle={toggleHidden}
						/>
					</div>
				) : (
					<RankList
						slices={stats.attribution[attrDim]}
						values={scaledAttrAll}
						hidden={hidden}
						dim={attrDim}
						kind={kind}
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
	values,
	hidden,
	dim,
	kind,
	onToggle,
	wide,
}: {
	slices: UsageSlice[];
	values: UsageSlice[];
	hidden: string[];
	dim: string;
	kind: UsageValueKind;
	onToggle: (dim: string, name: string) => void;
	wide?: boolean;
}) {
	const amounts = new Map(values.map((item) => [item.name, item.cost]));
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
							<em>{kind === "usd" ? formatUsd(item.cost) : formatCompactToken(amounts.get(item.name) ?? item.cost)}</em>
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
