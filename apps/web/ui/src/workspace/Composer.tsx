import { useMemo, useState, type ReactNode } from "react";

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
								<StopIcon />
							</button>
						) : (
							<button type="submit" className="icon-btn primary" title="Send" aria-label="Send" disabled={!canSend}>
								<ArrowIcon />
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

function ArrowIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path d="M8 3.2v9.6M4.2 7.1 8 3.2l3.8 3.9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function StopIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
			<rect x="3" y="3" width="8" height="8" rx="1.2" />
		</svg>
	);
}
