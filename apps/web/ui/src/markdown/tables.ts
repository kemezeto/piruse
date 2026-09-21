const FENCE = /(```[\s\S]*?(?:```|$))/;
const SEP = /\|[\t ]*:?-{3,}:?[\t ]*(?:\|[\t ]*:?-{3,}:?[\t ]*)+\|/;

export function normalizeMarkdownTables(source: string): string {
	return source.split(FENCE).map((part, index) => (index % 2 === 1 ? part : normalizeProse(part))).join("");
}

function normalizeProse(text: string): string {
	return text.replace(/^[^\n]*\|[^\n]*$/gm, expandCollapsedTable);
}

function expandCollapsedTable(line: string): string {
	const match = line.match(SEP);
	if (!match || match.index == null) return line;
	const separator = match[0].trim();
	const before = line.slice(0, match.index);
	const after = line.slice(match.index + match[0].length);
	const headerCells = cellsOf(before);
	const bodyCells = cellsOf(after);
	if (headerCells.length === 0 && bodyCells.length === 0) return line;

	const colCount = separator.match(/-{3,}/g)?.length ?? 0;
	if (colCount < 1) return line;

	const prefix = before.split("|")[0]?.trimEnd() ?? "";
	const rows = [
		...chunk(headerCells, colCount).map(formatRow),
		separator,
		...chunk(bodyCells, colCount).map(formatRow),
	];
	if (prefix.trim()) return `${prefix.trim()}\n${rows.join("\n")}`;
	return rows.join("\n");
}

function cellsOf(segment: string): string[] {
	if (!segment.includes("|")) return [];
	return segment
		.split("|")
		.map((cell) => cell.trim())
		.filter((cell, index, cells) => {
			if (cell === "" && (index === 0 || index === cells.length - 1)) return false;
			return cell !== "";
		});
}

function chunk(items: string[], size: number): string[][] {
	const rows: string[][] = [];
	for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
	return rows;
}

function formatRow(cells: string[]): string {
	return `| ${cells.join(" | ")} |`;
}
