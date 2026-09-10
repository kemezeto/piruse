import { useEffect } from "react";

export function ConfirmDialog({
	open,
	title,
	body,
	confirmLabel,
	cancelLabel = "取消",
	busy = false,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	title: string;
	body: string;
	confirmLabel: string;
	cancelLabel?: string;
	busy?: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (!busy) onCancel();
			}
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [open, busy, onCancel]);

	if (!open) return null;
	return (
		<div className="dialog-root confirm-root">
			<button type="button" className="dialog-scrim" aria-label={cancelLabel} onClick={onCancel} />
			<div className="confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
				<h2 id="confirm-title">{title}</h2>
				<p>{body}</p>
				<div className="confirm-actions">
					<button type="button" className="confirm-cancel" disabled={busy} onClick={onCancel}>
						{cancelLabel}
					</button>
					<button type="button" className="confirm-ok" disabled={busy} onClick={onConfirm}>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
