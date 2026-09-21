import type { ViewMeta, ViewState } from "../../../protocol/src/view.ts";
import { projectView } from "../view.ts";
import { type AgentLane, type Context, type LaneSnapshot, reduceLaneSnapshot } from "./pi.ts";

export interface ViewSubscription {
	unsubscribe(): void;
	view(meta: ViewMeta): ViewState;
}

export interface RunHandlers {
	onText?: (delta: string) => void;
	onTool?: (name: string, hint: string) => void;
	onFail?: (message: string) => void;
}

export async function subscribeLaneView(options: {
	lane: AgentLane;
	context: Context;
	getMeta: () => ViewMeta;
	onState: (state: ViewState) => void;
}): Promise<ViewSubscription> {
	const watch = await options.lane.watch(options.context);
	let snapshot: LaneSnapshot = watch.snapshot;
	const view = (meta: ViewMeta): ViewState => projectView(meta, snapshot);
	watch.start((event) => {
		if (reduceLaneSnapshot(snapshot, event) === "rebase") {
			void watch.resnapshot(options.context).then((next) => {
				snapshot = next;
				options.onState(view(options.getMeta()));
			});
			return;
		}
		options.onState(view(options.getMeta()));
	});
	return {
		unsubscribe: () => watch.unsubscribe(),
		view,
	};
}

export async function subscribeLaneRun(options: {
	lane: AgentLane;
	context: Context;
	handlers: RunHandlers;
}): Promise<() => void> {
	const watch = await options.lane.watch(options.context);
	watch.start((event) => {
		if (event.type === "message_update") {
			const inner = "event" in event ? event.event : undefined;
			if (inner && typeof inner === "object" && inner.type === "text_delta" && "delta" in inner) {
				options.handlers.onText?.(String(inner.delta));
			}
			return;
		}
		if (event.type === "tool_start") {
			const args = "args" in event ? (event.args as { command?: string; path?: string }) : {};
			options.handlers.onTool?.(event.toolName, args.command ?? args.path ?? "");
			return;
		}
		if (event.type === "run_end" && "status" in event && event.status === "failed") {
			options.handlers.onFail?.(event.error.message);
		}
	});
	return () => watch.unsubscribe();
}
