import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpIcon, StopIcon } from "tdesign-icons-react";

export function Composer({
	layout,
	running,
	onSend,
	onAbort,
	autoFocus = false,
	model,
	workspace,
	permission,
}: {
	layout: "welcome" | "chat";
	running: boolean;
	onSend: (text: string) => void;
	onAbort: () => void;
	autoFocus?: boolean;
	model: ReactNode;
	workspace: ReactNode;
	permission: ReactNode;
}) {
	const [text, setText] = useState("");
	const canSend = useMemo(() => text.trim().length > 0 && !running, [text, running]);
	const submit = (): void => {
		if (!canSend) return;
		onSend(text);
		setText("");
	};
	return (
		<div className={`composer-shell ${layout}`}>
			<form
				className="composer"
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<textarea
					value={text}
					autoFocus={autoFocus}
					placeholder=""
					rows={1}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							submit();
						}
					}}
				/>
				<div className="composer-bar">
					{layout === "chat" ? permission : null}
					<div className="composer-bar-end">
						{model}
						{running ? (
							<button type="button" className="icon-btn primary" title="Stop" aria-label="Stop" onClick={onAbort}>
								<StopIcon size={14} />
							</button>
						) : (
							<button type="submit" className="icon-btn primary" title="Send" aria-label="Send" disabled={!canSend}>
								<ArrowUpIcon size={16} />
							</button>
						)}
					</div>
				</div>
			</form>
			{layout === "welcome" ? (
				<div className="composer-meta">
					{workspace}
					{permission}
				</div>
			) : null}
		</div>
	);
}
