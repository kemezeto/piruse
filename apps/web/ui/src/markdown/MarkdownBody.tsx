import { useMemo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdownTables } from "./tables";

const plugins = [remarkGfm];

const components: Components = {
	table({ children }) {
		return (
			<div className="md-table-wrap">
				<table>{children}</table>
			</div>
		);
	},
};

export function MarkdownBody({ text }: { text: string }) {
	const source = useMemo(() => normalizeMarkdownTables(text || " "), [text]);
	return (
		<Markdown remarkPlugins={plugins} components={components}>
			{source}
		</Markdown>
	);
}
