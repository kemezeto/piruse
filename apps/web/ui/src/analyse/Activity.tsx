import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, FilterIcon, RefreshIcon } from "tdesign-icons-react";
import { Pagination, Popup } from "tdesign-react";
import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { relativeTime } from "../format";
import {
	activityFilterOptions,
	buildActivityStats,
	formatDuration,
	sortedActivity,
	type ActivitySort,
	type OverlayMetric,
} from "./activity";
import { concurrencyOption, formatUsd } from "./charts";
import { DateRangePicker } from "./DateRangePicker";
import { EChart } from "./EChart";
import { resolveRange, todayShanghai, type OverviewRange } from "./range";

const OVERLAYS: { id: OverlayMetric; label: string }[] = [
	{ id: "none", label: "无" },
	{ id: "token", label: "Token" },
	{ id: "cost", label: "成本" },
];

function shanghaiClock(ms = Date.now()): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Shanghai",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(ms));
}

export function Activity({ projects, models }: { projects: ViewProjectOption[]; models: ViewModelOption[] }) {
	const today = todayShanghai();
	const [range, setRange] = useState<OverviewRange>({ mode: "calendar", grain: "month", anchor: today });
	const [project, setProject] = useState("所有项目");
	const [agent, setAgent] = useState("全部代理");
	const [session, setSession] = useState("全部会话");
	const [overlay, setOverlay] = useState<OverlayMetric>("token");
	const [sort, setSort] = useState<ActivitySort>("minutes");
	const [desc, setDesc] = useState(true);
	const [updatedAt, setUpdatedAt] = useState(Date.now);
	const [overlayOpen, setOverlayOpen] = useState(false);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const resolved = useMemo(() => resolveRange(range, today), [range, today]);
	const options = useMemo(() => activityFilterOptions(projects), [projects]);
	const stats = useMemo(
		() => buildActivityStats(resolved, projects, models, { project, agent, session }, updatedAt, today),
		[resolved, projects, models, project, agent, session, updatedAt, today],
	);
	const rows = useMemo(() => sortedActivity(stats.rows, sort, desc), [stats.rows, sort, desc]);
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
	const currentPage = Math.min(page, pageCount);
	const paged = useMemo(
		() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[rows, currentPage, pageSize],
	);
	const chart = useMemo(() => concurrencyOption(stats.days, overlay), [stats.days, overlay]);
	const overlayLabel = OVERLAYS.find((item) => item.id === overlay)?.label ?? "Token";

	useEffect(() => {
		setPage(1);
	}, [project, agent, session, sort, desc, resolved.start, resolved.end]);

	function toggleSort(next: ActivitySort): void {
		if (sort === next) setDesc((current) => !current);
		else {
			setSort(next);
			setDesc(next === "minutes" || next === "cost");
		}
	}

	return (
		<div className="ov">
			<div className="ov-toolbar">
				<div className="ov-toolbar-start">
					<DateRangePicker range={range} today={today} onChange={setRange} />
					<FilterMenu value={project} options={options.projects} onChange={setProject} />
					<FilterMenu value={agent} options={options.agents} onChange={setAgent} />
					<FilterMenu value={session} options={options.sessions} onChange={setSession} />
					<button type="button" className="ov-tool ghost" onClick={() => setUpdatedAt(Date.now())}>
						<RefreshIcon size={15} />
						<span>{relativeTime(updatedAt)}更新</span>
					</button>
				</div>
			</div>

			<div className="use-kpis act-kpis">
				<article className="use-kpi active">
					<strong>{stats.peakConcurrency}</strong>
					<span>峰值并发</span>
					<em>于 {stats.peakAt}</em>
				</article>
				<article className="use-kpi">
					<strong>{formatDuration(stats.activeMinutes)}</strong>
					<span>活跃</span>
					<em>空闲 {formatDuration(stats.idleMinutes)}</em>
				</article>
				<article className="use-kpi">
					<strong>{Math.round(stats.agentMinutes)}</strong>
					<span>代理分钟数</span>
					<em>{stats.untimed} 个未计时</em>
				</article>
				<article className="use-kpi">
					<strong>{stats.sessions}</strong>
					<span>会话</span>
				</article>
				<article className="use-kpi">
					<strong>{stats.projects}</strong>
					<span>项目</span>
				</article>
				<article className="use-kpi">
					<strong>{stats.models}</strong>
					<span>模型</span>
				</article>
				<article className="use-kpi">
					<strong>{formatUsd(stats.totalCost)}</strong>
					<span>总成本</span>
				</article>
			</div>

			<section className="ov-card">
				<div className="ov-card-head">
					<h2>{stats.inProgress ? `进行中，截至 ${shanghaiClock(updatedAt)}` : "活动"}</h2>
					<div className="act-legend">
						<span>
							<i style={{ background: "#4f7dff" }} />
							交互式
						</span>
						<span>
							<i style={{ background: "#fb923c" }} />
							自动化
						</span>
						<Popup
							visible={overlayOpen}
							trigger="click"
							placement="bottom-right"
							delay={0}
							destroyOnClose
							overlayInnerClassName="popover"
							content={
								<div className="popover-list" role="listbox" aria-label="叠加指标">
									<div className="popover-item-label">叠加指标</div>
									{OVERLAYS.map((item) => (
										<button
											key={item.id}
											type="button"
											role="option"
											aria-selected={overlay === item.id}
											className={`popover-item${overlay === item.id ? " active" : ""}`}
											onClick={() => {
												setOverlay(item.id);
												setOverlayOpen(false);
											}}
										>
											<span className="popover-item-title">{item.label}</span>
										</button>
									))}
								</div>
							}
							onVisibleChange={setOverlayOpen}
						>
							<button type="button" className={`ov-tool${overlayOpen ? " open" : ""}`}>
								<span>叠加{overlay === "none" ? "" : ` · ${overlayLabel}`}</span>
								<ChevronDownIcon size={14} />
							</button>
						</Popup>
					</div>
				</div>
				<EChart className="ov-chart act-chart" option={chart} />
			</section>

			<section className="ov-card">
				<div className="ov-card-head">
					<h2>会话</h2>
					<span className="act-count">共 {stats.sessions}</span>
				</div>
				<div className="act-table-wrap">
					<table className="act-table">
						<thead>
							<tr>
								<SortHead id="title" label="会话" sort={sort} desc={desc} onSort={toggleSort} />
								<th>模型</th>
								<SortHead id="project" label="项目" sort={sort} desc={desc} onSort={toggleSort} />
								<SortHead id="agent" label="代理" sort={sort} desc={desc} onSort={toggleSort} />
								<SortHead id="minutes" label="代理分钟" sort={sort} desc={desc} onSort={toggleSort} numeric />
								<SortHead id="cost" label="成本" sort={sort} desc={desc} onSort={toggleSort} numeric />
								<SortHead id="window" label="时间窗" sort={sort} desc={desc} onSort={toggleSort} numeric />
							</tr>
						</thead>
						<tbody>
							{paged.map((item) => (
								<tr key={item.id}>
									<td>
										<button type="button" className="act-session">
											{item.title}
										</button>
									</td>
									<td>{item.model}</td>
									<td>{item.project}</td>
									<td>{item.agent}</td>
									<td className="num">{item.timed ? item.minutes : "—"}</td>
									<td className="num">{formatUsd(item.cost)}</td>
									<td className="num">{item.window}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{rows.length > 0 ? (
					<div className="act-pager">
						<Pagination
							current={currentPage}
							pageSize={pageSize}
							total={rows.length}
							size="small"
							showJumper
							totalContent={false}
							pageSizeOptions={[10, 20, 50]}
							onChange={(info) => {
								setPage(info.current);
								setPageSize(info.pageSize);
							}}
						/>
					</div>
				) : null}
			</section>
		</div>
	);
}

function SortHead({
	id,
	label,
	sort,
	desc,
	onSort,
	numeric,
}: {
	id: ActivitySort;
	label: string;
	sort: ActivitySort;
	desc: boolean;
	onSort: (id: ActivitySort) => void;
	numeric?: boolean;
}) {
	const active = sort === id;
	return (
		<th className={numeric ? "num" : undefined}>
			<button type="button" className={`act-sort${active ? " active" : ""}`} onClick={() => onSort(id)}>
				{label}
				{active ? <ChevronDownIcon size={14} className={desc ? "" : "flip"} /> : null}
			</button>
		</th>
	);
}

function FilterMenu({
	value,
	options,
	onChange,
}: {
	value: string;
	options: string[];
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popup
			visible={open}
			trigger="click"
			placement="bottom-left"
			delay={0}
			destroyOnClose
			overlayInnerClassName="popover"
			content={
				<div className="popover-list" role="listbox">
					{options.map((name) => (
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
				<FilterIcon size={15} />
				<span>{value}</span>
				<ChevronDownIcon size={14} />
			</button>
		</Popup>
	);
}
