import type { LaneSnapshot } from "@earendil-works/pi-agent-core";
import type { ViewItem, ViewMeta, ViewState } from "../../protocol/src/view.ts";
import { itemsFromWindowEntry } from "./compaction/project.ts";
import { formatArgs, itemsFromMessage, textOfContent } from "./messages.ts";

export type { ViewItem, ViewMeta, ViewState } from "../../protocol/src/view.ts";

export function projectView(meta: ViewMeta, lane: LaneSnapshot): ViewState {
	const items: ViewItem[] = [];
	const starts = new Map<string, { args: string; at: number }>();

	for (const entry of lane.transcript) {
		const windowItems = itemsFromWindowEntry(entry);
		if (windowItems) {
			items.push(...windowItems.map((item) => ({ ...item, at: entry.timestamp })));
			continue;
		}
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type !== "toolCall") continue;
				starts.set(block.id, { args: formatArgs(block.arguments), at: message.timestamp });
			}
		}
		for (const item of itemsFromMessage(entry.id, message)) {
			if (item.kind === "tool" && message.role === "toolResult") {
				const start = starts.get(message.toolCallId);
				items.push({
					...item,
					args: start?.args || item.args,
					durationMs: start ? Math.max(0, message.timestamp - start.at) : undefined,
				});
				continue;
			}
			items.push(item);
		}
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
		thinkingLevel: lane.configuration.thinkingLevel,
		models: meta.models,
		providers: meta.providers,
		providerChoices: meta.providerChoices,
		projects: meta.projects,
		sessions: meta.sessions,
		archivedSessions: meta.archivedSessions,
		permissionMode: meta.permissionMode,
		pendingApprovals: meta.pendingApprovals,
		packages: meta.packages ?? { skills: [], extensions: [], diagnostics: [], unsupported: [] },
		running: lane.operation !== null,
		items,
	};
}