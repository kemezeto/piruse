import type { Entry } from "../runtime/index.ts";
import type { ViewItem } from "../../../protocol/src/view.ts";

/** Compacted window and branch summaries. Other transcript types stay in view.ts. */
export function itemsFromWindowEntry(entry: Entry): ViewItem[] | undefined {
	if (entry.type === "compaction") {
		return [{ id: entry.id, kind: "note", text: `compaction · ${entry.summary}` }];
	}
	if (entry.type === "branch_summary") {
		return [{ id: entry.id, kind: "note", text: entry.summary }];
	}
	return undefined;
}
