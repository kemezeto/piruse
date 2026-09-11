import type { EChartsCoreOption } from "echarts/core";
import type { ActivityMetric, DayStat, SkillTrendPoint, TimeGrain, WeekPoint } from "./demo";
import type { UsageDay, UsageSlice } from "./usage";
import { seriesFor } from "./demo";
import { formatMd, formatZhDate, formatZhShort } from "./range";

export const METRIC_LABEL: Record<ActivityMetric, string> = {
	messages: "消息",
	sessions: "会话",
	tokens: "输出 Token",
};

const GREENS = ["#ebedf0", "#c6e8c9", "#78c47d", "#3fa047", "#216e39"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatInt(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

const tooltipChrome = {
	borderWidth: 0,
	backgroundColor: "#1c1c1c",
	textStyle: { color: "#fff", fontSize: 13, fontWeight: 500 },
	padding: [8, 12] as [number, number],
	extraCssText: "border-radius:8px;box-shadow:0 8px 22px rgba(0,0,0,.18);",
};

function tooltipPoint(params: unknown): { name?: string; value?: unknown } | undefined {
	const row = Array.isArray(params) ? params[0] : params;
	if (!row || typeof row !== "object") return undefined;
	return row as { name?: string; value?: unknown };
}

function metricOf(day: DayStat, metric: ActivityMetric): number {
	if (metric === "sessions") return day.sessions;
	if (metric === "tokens") return day.tokens;
	return day.messages;
}

export function calendarHeatOption(days: DayStat[], metric: ActivityMetric, start: string, end: string): EChartsCoreOption {
	const unit = METRIC_LABEL[metric];
	const data = days.map((day) => [day.date, metricOf(day, metric)] as [string, number]);
	const max = Math.max(1, ...data.map((item) => item[1]));
	return {
		tooltip: {
			...tooltipChrome,
			formatter: (params: unknown) => {
				const row = tooltipPoint(params)?.value as [string, number] | undefined;
				if (!row) return "";
				return `${formatZhDate(row[0])}: ${formatInt(row[1])} ${unit}`;
			},
		},
		visualMap: {
			show: false,
			min: 0,
			max,
			inRange: { color: GREENS },
		},
		calendar: {
			top: 28,
			left: 36,
			right: 8,
			bottom: 8,
			range: [start, end],
			firstDay: 1,
			cellSize: ["auto", 13],
			itemStyle: {
				color: GREENS[0],
				borderWidth: 3,
				borderColor: "#fff",
				borderRadius: 3,
			},
			splitLine: { show: false },
			yearLabel: { show: false },
			monthLabel: {
				nameMap: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"],
				color: "#8a8a86",
				fontSize: 11,
			},
			dayLabel: {
				firstDay: 1,
				nameMap: WEEKDAYS,
				color: "#8a8a86",
				fontSize: 11,
				formatter: (name: string) => (name === "Mon" || name === "Wed" || name === "Fri" ? name : ""),
			},
		},
		series: [
			{
				type: "heatmap",
				coordinateSystem: "calendar",
				data,
				emphasis: {
					itemStyle: {
						borderColor: "#9aa0a6",
						borderWidth: 1,
					},
				},
			},
		],
	};
}

export function activityBarOption(days: DayStat[], grain: TimeGrain, metric: ActivityMetric): EChartsCoreOption {
	const unit = METRIC_LABEL[metric];
	const bars = seriesFor(days, grain, metric);
	const interval = Math.max(0, Math.floor((Math.max(bars.length, 1) - 1) / 3));
	return {
		tooltip: {
			...tooltipChrome,
			trigger: "axis",
			axisPointer: { type: "shadow" },
			formatter: (params: unknown) => {
				const point = tooltipPoint(params);
				const date = String(point?.name ?? "");
				const value = Number(point?.value ?? 0);
				if (!date) return "";
				const label = grain === "month" ? date.slice(0, 7) : formatZhDate(date);
				return `${label}: ${formatInt(value)} ${unit}`;
			},
		},
		grid: { left: 6, right: 6, top: 12, bottom: 22, containLabel: false },
		xAxis: {
			type: "category",
			data: bars.map((item) => item.date),
			axisTick: { show: false },
			axisLine: { show: false },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				interval,
				formatter: (value: string) => formatZhShort(value),
			},
		},
		yAxis: { type: "value", show: false, splitLine: { show: false } },
		series: [
			{
				type: "bar",
				data: bars.map((item) => item.value),
				barMaxWidth: 18,
				itemStyle: { color: "#5b7cfa", borderRadius: [2, 2, 0, 0] },
			},
		],
	};
}

export function hourHeatOption(grid: number[][], unit: string): EChartsCoreOption {
	const data: [number, number, number][] = [];
	let max = 1;
	for (let dow = 0; dow < 7; dow += 1) {
		for (let hour = 0; hour < 24; hour += 1) {
			const value = grid[dow]?.[hour] ?? 0;
			data.push([hour, dow, value]);
			if (value > max) max = value;
		}
	}
	return {
		tooltip: {
			...tooltipChrome,
			formatter: (params: unknown) => {
				const row = tooltipPoint(params)?.value as [number, number, number] | undefined;
				if (!row) return "";
				return `${WEEKDAYS[row[1]]} ${String(row[0]).padStart(2, "0")}:00: ${formatInt(row[2])} ${unit}`;
			},
		},
		visualMap: {
			show: false,
			min: 0,
			max,
			inRange: { color: GREENS },
		},
		grid: { left: 36, right: 8, top: 18, bottom: 8 },
		xAxis: {
			type: "category",
			data: Array.from({ length: 24 }, (_, hour) => hour),
			position: "top",
			splitArea: { show: false },
			axisTick: { show: false },
			axisLine: { show: false },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				interval: 2,
			},
		},
		yAxis: {
			type: "category",
			data: WEEKDAYS,
			inverse: true,
			splitArea: { show: false },
			axisTick: { show: false },
			axisLine: { show: false },
			axisLabel: { color: "#8a8a86", fontSize: 11 },
		},
		series: [
			{
				type: "heatmap",
				data,
				itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 2 },
				emphasis: { itemStyle: { borderColor: "#9aa0a6", borderWidth: 1 } },
			},
		],
	};
}

export function toolWeekOption(weeks: WeekPoint[]): EChartsCoreOption {
	const interval = Math.max(0, Math.floor((Math.max(weeks.length, 1) - 1) / 7));
	return {
		tooltip: {
			...tooltipChrome,
			trigger: "axis",
			axisPointer: { type: "shadow" },
			formatter: (params: unknown) => {
				const point = tooltipPoint(params);
				const date = String(point?.name ?? "");
				if (!date) return "";
				return `${formatMd(date)}: ${formatInt(Number(point?.value ?? 0))} 次调用`;
			},
		},
		grid: { left: 4, right: 4, top: 10, bottom: 22 },
		xAxis: {
			type: "category",
			data: weeks.map((item) => item.date),
			axisTick: { show: false },
			axisLine: { show: false },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				interval,
				formatter: (value: string) => formatMd(value),
			},
		},
		yAxis: { type: "value", show: false, splitLine: { show: false } },
		series: [
			{
				type: "bar",
				data: weeks.map((item) => item.calls),
				barMaxWidth: 28,
				itemStyle: { color: "#3b82f6", borderRadius: [2, 2, 0, 0] },
			},
		],
	};
}

export function skillTrendOption(
	points: SkillTrendPoint[],
	names: string[],
	colors: string[],
	grain: TimeGrain,
): EChartsCoreOption {
	const buckets = new Map<string, Record<string, number>>();
	for (const point of points) {
		const date = point.date;
		const parsed = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
		const key =
			grain === "day"
				? date
				: grain === "week"
					? shiftYmd(date, parsed.getDay() === 0 ? -6 : 1 - parsed.getDay())
					: date.slice(0, 7);
		const current = buckets.get(key) ?? Object.fromEntries(names.map((name) => [name, 0]));
		for (const name of names) current[name] = (current[name] ?? 0) + (point.values[name] ?? 0);
		buckets.set(key, current);
	}
	const dates = [...buckets.keys()].sort();
	const interval = Math.max(0, Math.floor((Math.max(dates.length, 1) - 1) / 7));
	const peak = Math.max(1, ...dates.flatMap((date) => names.map((name) => buckets.get(date)?.[name] ?? 0)));
	return {
		tooltip: {
			...tooltipChrome,
			trigger: "axis",
			formatter: (params: unknown) => {
				const rows = Array.isArray(params) ? params : [params];
				const date = String((rows[0] as { name?: string } | undefined)?.name ?? "");
				if (!date) return "";
				const label = grain === "month" ? date : formatZhDate(date.length === 10 ? date : `${date}-01`);
				const lines = rows
					.map((row) => {
						const item = row as { seriesName?: string; value?: number };
						if (!item.seriesName || item.value == null || Number(item.value) === 0) return "";
						return `${item.seriesName}: ${formatInt(Number(item.value))}`;
					})
					.filter(Boolean);
				return [label, ...lines].join("<br/>");
			},
		},
		legend: { show: false },
		grid: { left: 8, right: 18, top: 18, bottom: 8, containLabel: true },
		xAxis: {
			type: "category",
			data: dates,
			boundaryGap: true,
			axisTick: { show: false },
			axisLine: { lineStyle: { color: "#e5e7eb" } },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				hideOverlap: false,
				interval,
				margin: 10,
				formatter: (value: string) => (value.length === 7 ? `${Number(value.slice(5, 7))}月` : formatZhShort(value)),
			},
		},
		yAxis: {
			type: "value",
			min: 0,
			max: Math.max(3, peak + 1),
			minInterval: 1,
			splitLine: { lineStyle: { color: "#f0f0ee" } },
			axisLabel: { color: "#8a8a86", fontSize: 11 },
		},
		series: names.map((name, index) => ({
			name,
			type: "line",
			showSymbol: grain === "month" || dates.length <= 20,
			symbolSize: 7,
			smooth: false,
			connectNulls: true,
			clip: false,
			data: dates.map((date) => buckets.get(date)?.[name] ?? 0),
			itemStyle: { color: colors[index] ?? "#16a34a" },
			lineStyle: { width: grain === "day" ? 1.5 : 2 },
		})),
	};
}

export type UsageValueKind = "usd" | "token";

export function formatUsd(value: number): string {
	return `US$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCompactToken(value: number): string {
	const abs = Math.abs(value);
	if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return Math.round(value).toLocaleString("en-US");
}

export function formatUsageValue(value: number, kind: UsageValueKind): string {
	return kind === "usd" ? formatUsd(value) : formatCompactToken(value);
}

function formatUsageAxis(value: number, kind: UsageValueKind): string {
	return kind === "usd" ? `US$ ${Number(value).toFixed(2)}` : formatCompactToken(value);
}

function luminance(hex: string): number {
	const raw = hex.replace("#", "");
	const n = Number.parseInt(raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw, 16);
	const r = (n >> 16) & 255;
	const g = (n >> 8) & 255;
	const b = n & 255;
	return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function costTrendOption(
	days: UsageDay[],
	slices: UsageSlice[],
	kind: UsageValueKind = "usd",
): EChartsCoreOption {
	const names = slices.map((item) => item.name);
	const interval = Math.max(0, Math.floor((Math.max(days.length, 1) - 1) / 4));
	const minValue = kind === "usd" ? 0.0005 : 0.5;
	return {
		tooltip: {
			...tooltipChrome,
			trigger: "axis",
			axisPointer: { type: "line" },
			formatter: (params: unknown) => {
				const rows = Array.isArray(params) ? params : [params];
				const date = String((rows[0] as { name?: string } | undefined)?.name ?? "");
				if (!date) return "";
				const lines = rows
					.map((row) => {
						const item = row as { seriesName?: string; value?: number; marker?: string };
						if (!item.seriesName || item.value == null || Number(item.value) < minValue) return "";
						return `${item.marker ?? ""}${item.seriesName}: ${formatUsageValue(Number(item.value), kind)}`;
					})
					.filter(Boolean);
				return [`${formatZhDate(date)}`, ...lines].join("<br/>");
			},
		},
		legend: { show: false },
		grid: { left: 8, right: 12, top: 18, bottom: 8, containLabel: true },
		xAxis: {
			type: "category",
			boundaryGap: false,
			data: days.map((item) => item.date),
			axisTick: { show: false },
			axisLine: { lineStyle: { color: "#e5e7eb" } },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				interval,
				formatter: (value: string) => formatZhShort(value),
			},
		},
		yAxis: {
			type: "value",
			min: 0,
			splitLine: { lineStyle: { color: "#f0f0ee" } },
			axisLabel: {
				color: "#8a8a86",
				fontSize: 11,
				formatter: (value: number) => formatUsageAxis(value, kind),
			},
		},
		series: names.map((name, index) => ({
			name,
			type: "line",
			stack: "usage",
			smooth: 0.35,
			showSymbol: false,
			lineStyle: { width: 0 },
			areaStyle: { opacity: 0.92 },
			emphasis: { focus: "series" },
			itemStyle: { color: slices[index]?.color ?? "#3b6cf0" },
			data: days.map((day) =>
				kind === "usd" ? Number((day.byName[name] ?? 0).toFixed(4)) : Math.round(day.byName[name] ?? 0),
			),
		})),
	};
}

export function costTreemapOption(slices: UsageSlice[], kind: UsageValueKind = "usd"): EChartsCoreOption {
	const total = slices.reduce((sum, item) => sum + item.cost, 0);
	return {
		tooltip: {
			...tooltipChrome,
			formatter: (params: unknown) => {
				const item = params as { name?: string; value?: number };
				if (!item.name) return "";
				const share = total === 0 ? 0 : (Number(item.value) / total) * 100;
				return `${item.name}<br/>${formatUsageValue(Number(item.value ?? 0), kind)} · ${share.toFixed(1)}%`;
			},
		},
		series: [
			{
				type: "treemap",
				width: "100%",
				height: "100%",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				roam: false,
				nodeClick: false,
				breadcrumb: { show: false },
				label: {
					show: true,
					formatter: (params: { name: string; value: number }) => {
						const share = total === 0 ? 0 : (params.value / total) * 100;
						return `${params.name}\n${formatUsageValue(params.value, kind)}\n${share.toFixed(1)}%`;
					},
					fontSize: 12,
					fontWeight: 600,
					lineHeight: 18,
					overflow: "truncate",
				},
				itemStyle: {
					borderColor: "#fff",
					borderWidth: 3,
					gapWidth: 3,
				},
				data: slices.map((item) => ({
					name: item.name,
					value: kind === "usd" ? Number(item.cost.toFixed(4)) : Math.round(item.cost),
					itemStyle: { color: item.color },
					label: { color: luminance(item.color) > 0.62 ? "#1c1c1c" : "#fff" },
				})),
			},
		],
	};
}

function shiftYmd(ymd: string, days: number): string {
	const date = new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
	date.setDate(date.getDate() + days);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}
