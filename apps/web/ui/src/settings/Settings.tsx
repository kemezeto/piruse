import { useState } from "react";
import { Dialog } from "tdesign-react";
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

	return (
		<Dialog
			visible={open}
			header="设置"
			footer={false}
			width="52rem"
			placement="center"
			destroyOnClose
			dialogClassName="settings-dialog"
			onClose={onClose}
		>
			<div className="dialog-body">
				<nav className="dialog-nav" aria-label="设置">
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
		</Dialog>
	);
}
