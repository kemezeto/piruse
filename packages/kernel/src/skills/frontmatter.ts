function normalizeNewlines(value: string): string {
	return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function unquote(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function parseScalar(raw: string): unknown {
	const value = raw.trim();
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "") return value === "null" ? null : "";
	return unquote(value);
}

function parseSimpleYaml(source: string): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	const lines = source.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim() || line.trimStart().startsWith("#")) continue;
		const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
		if (!match) continue;
		const key = match[1];
		const rest = match[2];
		if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
			const folded = rest.startsWith(">");
			const block: string[] = [];
			while (i + 1 < lines.length && (/^[\t ]+/.test(lines[i + 1]) || lines[i + 1].trim() === "")) {
				i += 1;
				block.push(lines[i].replace(/^\t/, "  ").replace(/^  /, ""));
			}
			const text = folded ? block.map((row) => row.trim()).filter(Boolean).join(" ") : block.join("\n").trim();
			data[key] = text;
			continue;
		}
		data[key] = parseScalar(rest);
	}
	return data;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
	const normalized = normalizeNewlines(content);
	if (!normalized.startsWith("---")) {
		return { frontmatter: {}, body: normalized };
	}
	const endIndex = normalized.indexOf("\n---", 3);
	if (endIndex === -1) {
		return { frontmatter: {}, body: normalized };
	}
	return {
		frontmatter: parseSimpleYaml(normalized.slice(4, endIndex)),
		body: normalized.slice(endIndex + 4).replace(/^\n/, ""),
	};
}
