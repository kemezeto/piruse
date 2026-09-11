import type { EChartsCoreOption } from "echarts/core";
import type { ActivityMetric, DayStat, TimeGrain } from "./demo";
import { seriesFor } from "./demo";
import { formatZhDate, formatZhShort } from "./range";

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
