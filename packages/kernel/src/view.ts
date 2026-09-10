import type { LaneSnapshot } from "@earendil-works/pi-agent-core";
import type { ViewItem, ViewMeta, ViewState } from "../../protocol/src/view.ts";
import { itemsFromWindowEntry } from "./compaction/project.ts";
import { formatArgs, itemsFromMessage, textOfContent } from "./messages.ts";

export type { ViewItem, ViewMeta, ViewState } from "../../protocol/src/view.ts";

export function projectView(meta: ViewMeta, lane: LaneSnapshot): ViewState {
	const items: ViewItem[] = [];
	for (const entry of lane.transcript) {
		const windowItems = itemsFromWindowEntry(entry);
		if (windowItems) {
			items.push(...windowItems);
			continue;
		}
		if (entry.type !== "message") continue;
		items.push(...itemsFromMessage(entry.id, entry.message));
	}

	const operation = lane.operation;
	if (operation?.streamingMessage) {
		items.push(...itemsFromMessage(`${operation.id}:stream`, operation.streamingMessage, true));
	}
	for (const tool of operation?.runningTools ?? []) {
		items.push({
			id: tool.toolCallId,
			kind: "tool",
			name: tool.toolName,
			args: formatArgs(tool.args),
			result: tool.result ? textOfContent(tool.result.content) : undefined,
			running: tool.status === "running",
			isError: tool.status === "settled" ? tool.isError : undefined,
		});
	}

	const last = lane.lastResult;
	if (last?.status === "failed" && last.error) {
		items.push({ id: `result:${last.operationId}`, kind: "note", text: last.error.message });
	}

	return {
		sessionId: meta.sessionId,
		sessionTitle: meta.sessionTitle,
		cwd: meta.cwd,
		sessionPath: meta.sessionPath,
		model: lane.configuration.model,
		models: meta.models,
		providers: meta.providers,
		providerChoices: meta.providerChoices,
		projects: meta.projects,
		sessions: meta.sessions,
		permissionMode: meta.permissionMode,
		pendingApprovals: meta.pendingApprovals,
		running: lane.operation !== null,
		items,
	};
}