import type { ViewSessionOption } from "@protocol/view";
import { relativeTime } from "../format";

export function ChatRow({
	session,
	active,
	running,
	now,
	onOpen,
	onArchive,
}: {
	session: ViewSessionOption;
	active: boolean;
	running: boolean;
	now: number;
	onOpen: () => void;
	onArchive: () => void;
}) {
	const blockSwitch = running && !active;
	const blockArchive = running && active;
	return (
		<div className={`sidebar-chat${active ? " active" : ""}`}>
			<button
				type="button"
				className="sidebar-chat-open"
				disabled={blockSwitch}
				title={blockSwitch ? "请先停止当前运行" : session.title}
				onClick={onOpen}
			>
				<span>{session.title}</span>
			</button>
			<button
				type="button"
				className="sidebar-chat-action"
				disabled={blockArchive}
				title={blockArchive ? "请先停止当前运行" : "归档"}
				onClick={onArchive}
			>
				<time dateTime={new Date(session.modifiedAt).toISOString()}>{relativeTime(session.modifiedAt, now)}</time>
				<span className="sidebar-chat-archive">归档</span>
			</button>
		</div>
	);
}
