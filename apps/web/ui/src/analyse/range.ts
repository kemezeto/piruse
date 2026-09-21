export type RangeGrain = "day" | "week" | "month";
export type RangeMode = "relative" | "calendar" | "custom";
export type RelativePreset = "1d" | "7d" | "30d" | "90d" | "1y";

export type OverviewRange =
	| { mode: "relative"; preset: RelativePreset }
	| { mode: "calendar"; grain: RangeGrain; anchor: string }
	| { mode: "custom"; start: string; end: string };

export type ResolvedRange = { start: string; end: string; label: string };

const PRESET_LABEL: Record<RelativePreset, string> = {
	"1d": "最近 24 小时",
	"7d": "最近 7 天",
	"30d": "最近 30 天",
	"90d": "最近 90 天",
	"1y": "最近一年",
};

export const RELATIVE_PRESETS: { id: RelativePreset; label: string }[] = (
	Object.keys(PRESET_LABEL) as RelativePreset[]
).map((id) => ({ id, label: PRESET_LABEL[id] }));

export function todayShanghai(): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

export function parseYmd(ymd: string): Date {
	const [year, month, day] = ymd.split("-").map(Number);
	return new Date(year, month - 1, day);
}

export function formatYmd(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function addDays(ymd: string, days: number): string {
	const date = parseYmd(ymd);
	date.setDate(date.getDate() + days);
	return formatYmd(date);
}

export function ymdShanghai(ms: number): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(ms));
}

export function clockShanghai(ms: number): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Shanghai",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(ms));
}

export function shanghaiMs(ymd: string, hour: number, minute: number): number {
	return new Date(`${ymd}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`).getTime();
}

export function addMonths(ymd: string, months: number): string {
	const date = parseYmd(ymd);
	date.setMonth(date.getMonth() + months);
	return formatYmd(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function mondayOf(ymd: string): string {
	const date = parseYmd(ymd);
	const dow = date.getDay();
	const offset = dow === 0 ? -6 : 1 - dow;
	return addDays(ymd, offset);
}

export function sundayOf(ymd: string): string {
	return addDays(mondayOf(ymd), 6);
}

export function monthStart(ymd: string): string {
	const date = parseYmd(ymd);
	return formatYmd(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function monthEnd(ymd: string): string {
	const date = parseYmd(ymd);
	return formatYmd(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function eachDay(start: string, end: string): string[] {
	const days: string[] = [];
	let cursor = start;
	while (cursor <= end) {
		days.push(cursor);
		cursor = addDays(cursor, 1);
	}
	return days;
}

export function formatZhDate(ymd: string): string {
	const date = parseYmd(ymd);
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatZhMonth(ymd: string): string {
	const date = parseYmd(ymd);
	return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatZhShort(ymd: string): string {
	const date = parseYmd(ymd);
	return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatMd(ymd: string): string {
	const date = parseYmd(ymd);
	return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function resolveRange(range: OverviewRange, today = todayShanghai()): ResolvedRange {
	if (range.mode === "relative") {
		const span = { "1d": 0, "7d": 6, "30d": 29, "90d": 89, "1y": 364 }[range.preset];
		return { start: addDays(today, -span), end: today, label: PRESET_LABEL[range.preset] };
	}
	if (range.mode === "custom") {
		const start = range.start <= range.end ? range.start : range.end;
		const end = range.start <= range.end ? range.end : range.start;
		return { start, end, label: `${formatZhDate(start)} – ${formatZhShort(end)}` };
	}
	if (range.grain === "week") {
		const start = mondayOf(range.anchor);
		const end = sundayOf(range.anchor);
		return { start, end, label: `${formatZhDate(start)} – ${formatZhShort(end)}` };
	}
	if (range.grain === "month") {
		return { start: monthStart(range.anchor), end: monthEnd(range.anchor), label: formatZhMonth(range.anchor) };
	}
	return { start: range.anchor, end: range.anchor, label: formatZhDate(range.anchor) };
}

export function calendarCells(monthYmd: string): { ymd: string; inMonth: boolean }[] {
	const start = mondayOf(monthStart(monthYmd));
	return Array.from({ length: 42 }, (_, index) => {
		const ymd = addDays(start, index);
		return { ymd, inMonth: ymd.startsWith(monthYmd.slice(0, 7)) };
	});
}

export function inResolved(ymd: string, range: ResolvedRange): boolean {
	return ymd >= range.start && ymd <= range.end;
}
