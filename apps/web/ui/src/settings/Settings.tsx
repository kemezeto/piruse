import { useEffect, useState } from "react";
import type { ViewArchivedSession, ViewProviderChoice, ViewProviderOption, ViewSessionOption } from "@protocol/view";
import type { HostCommand } from "../socket";
import { ArchivePane } from "./ArchivePane";
import { ModelsPane } from "./ModelsPane";

type Pane = "appearance" | "models" | "archive";

export function SettingsDialog({
	open,
	providers,
	choices,
	sessions,
	archivedSessions,
	currentSessionId,
	running,
	onClose,
	onCommand,
}: {
	open: boolean;
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	currentSessionId: string;
	running: boolean;
	onClose: () => void;
	onCommand: HostCommand;
}) {
	const [pane, setPane] = useState<Pane>("models");

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="dialog-root">
			<button type="button" className="dialog-scrim" aria-label="Close settings" onClick={onClose} />
			<div className="dialog" role="dialog" aria-labelledby="settings-title">
				<header className="dialog-head">
					<h2 id="settings-title">Settings</h2>
					<button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
						<CloseIcon />
					</button>
				</header>
				<div className="dialog-body">
					<nav className="dialog-nav" aria-label="Settings">
						<button type="button" className={pane === "appearance" ? "active" : ""} onClick={() => setPane("appearance")}>
							外观
						</button>
						<button type="button" className={pane === "models" ? "active" : ""} onClick={() => setPane("models")}>
							模型
						</button>
						<button type="button" className={pane === "archive" ? "active" : ""} onClick={() => setPane("archive")}>
							存档
						</button>
					</nav>
					<div className="dialog-pane">
						{pane === "appearance" ? (
							<p className="dialog-placeholder">外观设置稍后提供。</p>
						) : pane === "archive" ? (
							<ArchivePane
								sessions={sessions}
								archivedSessions={archivedSessions}
								currentSessionId={currentSessionId}
								running={running}
								onCommand={onCommand}
							/>
						) : (
							<ModelsPane providers={providers} choices={choices} onCommand={onCommand} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function CloseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
			<path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}
