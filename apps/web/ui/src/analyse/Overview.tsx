import { useMemo, useState } from "react";
import { FilterIcon, RefreshIcon } from "tdesign-icons-react";
import { Popup } from "tdesign-react";
import type { AnalyseSnapshot } from "@protocol/analyse";
import type { ViewModelOption } from "@protocol/view";
import { relativeTime } from "../format";
import { DateRangePicker } from "./DateRangePicker";
import { EChart } from "./EChart";
import { SkillUsage } from "./SkillUsage";
import { ToolUsage } from "./ToolUsage";
import { activityBarOption, calendarHeatOption, hourHeatOption, METRIC_LABEL } from "./charts";
import { buildOverviewStats, sortedHot, type ActivityMetric, type HotSort, type TimeGrain } from "./demo";
import { resolveRange, todayShanghai, type OverviewRange } from "./range";

const ACTIVITY_METRICS: { id: ActivityMetric; label: string }[] = [
	{ id: "messages", label: "消息" },
	{ id: "sessions", label: "会话" },
	{ id: "tokens", label: "输出 Token" },
];

const TIME_METRICS: { id: "messages" | "sessions"; label: string }[] = [
	{ id: "messages", label: "消息" },
	{ id: "sessions", label: "会话" },
];

const GRAINS: { id: TimeGrain; label: string }[] = [
	{ id: "day", label: "日" },
	{ id: "week", label: "周" },
	{ id: "month", label: "月" },
];

const HOT_SORTS: { id: HotSort; label: string }[] = [
	{ id: "messages", label: "按消息数" },
	{ id: "duration", label: "按时长" },
	{ id: "tokens", label: "按输出 token" },
];

function formatInt(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function formatOne(value: number): string {
	return value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function Overview({
	snapshot,
	models,
	onReload,
}: {
	snapshot: AnalyseSnapshot | null;
	models: ViewModelOption[];
	onReload: () => void;
}) {
	const today = todayShanghai();
	const [range, setRange] = useState<OverviewRange>({ mode: "relative", preset: "1y" });
	const [model, setModel] = useState("全部");
	const [activityMetric, setActivityMetric] = useState<ActivityMetric>("messages");
	const [timeMetric, setTimeMetric] = useState<"messages" | "sessions">("messages");
	const [grain, setGrain] = useState<TimeGrain>("day");
	const [hotSort, setHotSort] = useState<HotSort>("messages");
	const [modelOpen, setModelOpen] = useState(false);

	const resolved = useMemo(() => resolveRange(range, today), [range, today]);
	const stats = useMemo(
		() => buildOverviewStats(resolved, snapshot?.sessions ?? [], models, model),
		[resolved, snapshot, models, model],
	);
	const heatOption = useMemo(
		() => calendarHeatOption(stats.days, activityMetric, resolved.start, resolved.end),
		[stats.days, activityMetric, resolved.start, resolved.end],
	);
	const barOption = useMemo(
		() => activityBarOption(stats.days, grain, timeMetric),
		[stats.days, grain, timeMetric],
	);
	const hourOption = useMemo(
		() => hourHeatOption(stats.hourGrid, METRIC_LABEL[timeMetric]),
		[stats.hourGrid, timeMetric],
	);
	const hot = useMemo(() => sortedHot(stats.hot, hotSort), [stats.hot, hotSort]);
	const modelNames = useMemo(() => ["全部", ...models.map((item) => item.name)], [models]);

	return (
		<div className="ov">
			<div className="ov-toolbar">
				<div className="ov-toolbar-start">
					<DateRangePicker range={range} today={today} onChange={setRange} />
					<button type="button" className="ov-tool ghost" onClick={onReload}>
						<RefreshIcon size={15} />
						<span>{relativeTime(snapshot?.generatedAt ?? Date.now())}更新</span>
					</button>
					<Popup
						visible={modelOpen}
						trigger="click"
						placement="bottom-left"
						delay={0}
						destroyOnClose
						overlayInnerClassName="popover"
						content={
							<div className="popover-list" role="listbox" aria-label="模型">
								{modelNames.map((name) => (
									<button
										key={name}
										type="button"
										role="option"
										aria-selected={model === name}
										className={`popover-item${model === name ? " active" : ""}`}
										onClick={() => {
											setModel(name);
											setModelOpen(false);
										}}
									>
										<span className="popover-item-title">{name}</span>
									</button>
								))}
							</div>
						}
						onVisibleChange={setModelOpen}
					>
						<button type="button" className="ov-tool">
							<FilterIcon size={15} />
							<span>模型：{model}</span>
						</button>
					</Popup>
				</div>
				<button type="button" className="ov-export" onClick={() => exportCsv(stats, resolved.label)}>
					导出 CSV
				</button>
			</div>

			<div className="ov-kpis">
				<Kpi value={formatInt(stats.sessions)} label="会话" />
				<Kpi value={formatInt(stats.messages)} label="消息" />
				<Kpi value={formatInt(stats.projects)} label="项目" />
				<Kpi value={formatInt(stats.activeDays)} label="活跃天数" />
				<Kpi
					value={formatOne(stats.perSession)}
					label="每会话消息数"
					hint={`中位数 ${formatInt(stats.median)} / p90 ${formatInt(stats.p90)}`}
				/>
				<Kpi value={`${(stats.focus * 100).toFixed(1)}%`} label="集中度" hint={stats.focusProject} />
			</div>

			<section className="ov-card ov-activity">
				<div className="ov-card-head">
					<h2>活动</h2>
					<div className="ov-pills" role="tablist" aria-label="活动指标">
						{ACTIVITY_METRICS.map((item) => (
							<button
								key={item.id}
								type="button"
								role="tab"
								className={activityMetric === item.id ? "active" : ""}
								onClick={() => setActivityMetric(item.id)}
							>
								{item.label}
							</button>
						))}
					</div>
				</div>
				<EChart className="ov-chart ov-chart-heat" option={heatOption} />
			</section>

			<div className="ov-split">
				<section className="ov-card">
					<div className="ov-card-head wrap">
						<div>
							<h2>按日期和小时查看活动</h2>
							<span className="ov-tz">Shanghai</span>
						</div>
						<div className="ov-filters">
							<div className="ov-pills" role="tablist" aria-label="时间指标">
								{TIME_METRICS.map((item) => (
									<button
										key={item.id}
										type="button"
										className={timeMetric === item.id ? "active" : ""}
										onClick={() => setTimeMetric(item.id)}
									>
										{item.label}
									</button>
								))}
							</div>
							<div className="ov-pills" role="tablist" aria-label="粒度">
								{GRAINS.map((item) => (
								<button
									key={item.id}
									type="button"
									role="tab"
									className={grain === item.id ? "active" : ""}
									onClick={() => setGrain(item.id)}
								>
										{item.label}
									</button>
								))}
							</div>
						</div>
					</div>
					<EChart className="ov-chart ov-chart-bar" option={barOption} />
					<EChart className="ov-chart ov-chart-hour" option={hourOption} />
				</section>

				<section className="ov-card">
					<div className="ov-card-head wrap">
						<h2>热门会话</h2>
						<div className="ov-filters">
							{stats.aborted > 0 ? <span className="ov-flag">{stats.aborted}个异常终止</span> : null}
							<div className="ov-pills" role="tablist" aria-label="排序">
								{HOT_SORTS.map((item) => (
								<button
									key={item.id}
									type="button"
									role="tab"
									className={hotSort === item.id ? "active" : ""}
									onClick={() => setHotSort(item.id)}
								>
										{item.label}
									</button>
								))}
							</div>
						</div>
					</div>
					<ol className="ov-hot">
						{hot.slice(0, 6).map((item, index) => (
							<li key={item.id}>
								<span className="ov-hot-n">{index + 1}</span>
								<div className="ov-hot-copy">
									<p>
										{item.aborted ? <i className="ov-dot" /> : null}
										{item.title}
									</p>
									<span>{item.project}</span>
								</div>
								<strong>
									{hotSort === "duration" ? `${item.durationMin}m` : hotSort === "tokens" ? formatInt(item.tokens) : formatInt(item.messages)}
								</strong>
							</li>
						))}
					</ol>
				</section>
			</div>
			<ToolUsage tools={stats.tools} categories={stats.toolCategories} weeks={stats.toolWeeks} total={stats.toolCalls} />
			{stats.skillCalls > 0 ? (
				<SkillUsage skills={stats.skills} trend={stats.skillTrend} total={stats.skillCalls} />
			) : (
				<section className="ov-card">
					<div className="ov-card-head">
						<h2>常用 Skills</h2>
						<span className="ov-muted">会话里还没有技能调用记录</span>
					</div>
				</section>
			)}
		</div>
	);
}

function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
	return (
		<article className="ov-kpi">
			<strong>{value}</strong>
			<span>{label}</span>
			{hint ? <em>{hint}</em> : null}
		</article>
	);
}

function exportCsv(stats: ReturnType<typeof buildOverviewStats>, label: string): void {
	const lines = [
		["范围", label],
		["会话", String(stats.sessions)],
		["消息", String(stats.messages)],
		["项目", String(stats.projects)],
		["活跃天数", String(stats.activeDays)],
		["每会话消息数", stats.perSession.toFixed(1)],
		["集中度", `${(stats.focus * 100).toFixed(1)}%`],
		[],
		["热门会话", "项目", "消息", "时长", "token", "异常终止"],
		...stats.hot.map((item) => [
			item.title,
			item.project,
			String(item.messages),
			String(item.durationMin),
			String(item.tokens),
			item.aborted ? "1" : "0",
		]),
	];
	const body = `\uFEFF${lines.map((row) => row.map(csvCell).join(",")).join("\n")}`;
	const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = "piruse-overview.csv";
	link.click();
	URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
	if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
	return value;
}
