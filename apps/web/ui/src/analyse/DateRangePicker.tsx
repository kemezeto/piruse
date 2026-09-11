import { useMemo, useState } from "react";
import { CalendarIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "tdesign-icons-react";
import { Popup } from "tdesign-react";
import {
	addMonths,
	calendarCells,
	formatZhMonth,
	monthStart,
	RELATIVE_PRESETS,
	resolveRange,
	type OverviewRange,
	type RangeGrain,
	type RangeMode,
} from "./range";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function DateRangePicker({
	range,
	today,
	onChange,
}: {
	range: OverviewRange;
	today: string;
	onChange: (range: OverviewRange) => void;
}) {
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<RangeMode>(range.mode);
	const [grain, setGrain] = useState<RangeGrain>(range.mode === "calendar" ? range.grain : "day");
	const [month, setMonth] = useState(() => monthStart(range.mode === "calendar" ? range.anchor : today));
	const [customStart, setCustomStart] = useState(range.mode === "custom" ? range.start : today);
	const [customEnd, setCustomEnd] = useState(range.mode === "custom" ? range.end : today);
	const label = useMemo(() => resolveRange(range, today).label, [range, today]);
	const resolved = useMemo(() => resolveRange(range, today), [range, today]);
	const cells = useMemo(() => calendarCells(month), [month]);

	return (
		<Popup
			visible={open}
			trigger="click"
			placement="bottom-left"
			destroyOnClose
			delay={0}
			overlayInnerClassName="ov-date-pop"
			overlayInnerStyle={{
				padding: "0.7rem",
				background: "var(--td-bg-color-container)",
				border: "1px solid var(--td-component-border)",
				borderRadius: "0.9rem",
				boxShadow: "var(--td-shadow-2)",
			}}
			content={
				<div className="ov-date">
					<div className="ov-seg" role="tablist" aria-label="日期方式">
						{(
							[
								["relative", "相对"],
								["calendar", "日历"],
								["custom", "自定义"],
							] as const
						).map(([id, name]) => (
							<button
								key={id}
								type="button"
								role="tab"
								className={mode === id ? "active" : ""}
								aria-selected={mode === id}
								onClick={() => setMode(id)}
							>
								{name}
							</button>
						))}
					</div>
					{mode === "relative" ? (
						<div className="ov-date-rel">
							{RELATIVE_PRESETS.map((item) => (
								<button
									key={item.id}
									type="button"
									className={range.mode === "relative" && range.preset === item.id ? "active" : ""}
									onClick={() => {
										onChange({ mode: "relative", preset: item.id });
										setOpen(false);
									}}
								>
									{item.label}
								</button>
							))}
						</div>
					) : null}
					{mode === "calendar" ? (
						<>
							<div className="ov-seg ov-seg-grain" role="tablist" aria-label="粒度">
								{(
									[
										["day", "日"],
										["week", "周"],
										["month", "月"],
									] as const
								).map(([id, name]) => (
									<button
										key={id}
										type="button"
										role="tab"
										className={grain === id ? "active brand" : ""}
										aria-selected={grain === id}
										onClick={() => setGrain(id)}
									>
										{name}
									</button>
								))}
							</div>
							<div className="ov-cal-nav">
								<button type="button" aria-label="上个月" onClick={() => setMonth(addMonths(month, -1))}>
									<ChevronLeftIcon size={16} />
								</button>
								<strong>{formatZhMonth(month)}</strong>
								<button type="button" aria-label="下个月" onClick={() => setMonth(addMonths(month, 1))}>
									<ChevronRightIcon size={16} />
								</button>
							</div>
							<div className="ov-cal-week">
								{WEEKDAYS.map((name) => (
									<span key={name}>{name}</span>
								))}
							</div>
							<div className="ov-cal-grid">
								{cells.map((cell) => {
									const inRange = cell.ymd >= resolved.start && cell.ymd <= resolved.end;
									const selected = range.mode !== "relative" && inRange;
									const isAnchor = range.mode === "calendar" && range.anchor === cell.ymd;
									return (
										<button
											key={cell.ymd}
											type="button"
											className={`${cell.inMonth ? "" : "muted"}${selected ? " selected" : ""}${isAnchor ? " anchor" : ""}`}
											onClick={() => {
												onChange({ mode: "calendar", grain, anchor: cell.ymd });
												setOpen(false);
											}}
										>
											{Number(cell.ymd.slice(8))}
										</button>
									);
								})}
							</div>
						</>
					) : null}
					{mode === "custom" ? (
						<div className="ov-date-custom">
							<label>
								开始
								<input
									type="date"
									value={customStart}
									max={today}
									onChange={(event) => {
										const start = event.target.value;
										setCustomStart(start);
										onChange({ mode: "custom", start, end: customEnd });
									}}
								/>
							</label>
							<label>
								结束
								<input
									type="date"
									value={customEnd}
									max={today}
									onChange={(event) => {
										const end = event.target.value;
										setCustomEnd(end);
										onChange({ mode: "custom", start: customStart, end });
									}}
								/>
							</label>
						</div>
					) : null}
				</div>
			}
			onVisibleChange={(next) => {
				setOpen(next);
				if (next) {
					setMode(range.mode);
					if (range.mode === "calendar") {
						setGrain(range.grain);
						setMonth(monthStart(range.anchor));
					} else {
						setMonth(monthStart(today));
					}
				}
			}}
		>
			<button type="button" className={`ov-tool${open ? " open" : ""}`} aria-label="选择日期范围" aria-expanded={open}>
				<CalendarIcon size={15} />
				<span>{label}</span>
				<ChevronDownIcon size={14} className={`caret-flip${open ? " open" : ""}`} />
			</button>
		</Popup>
	);
}
