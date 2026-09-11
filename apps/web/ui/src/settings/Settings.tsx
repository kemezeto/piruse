import { useState } from "react";
import { FolderMoveIcon, PaletteIcon, Robot2Icon } from "tdesign-icons-react";
import { Dialog } from "tdesign-react";
import type { ViewArchivedSession, ViewProviderChoice, ViewProviderOption, ViewSessionOption } from "@protocol/view";
import type { HostCommand } from "../socket";
import { ArchivePane } from "./ArchivePane";
import { ModelsPane } from "./ModelsPane";

type Pane = "appearance" | "models" | "archive";

const NAV: { id: Pane; label: string; icon: typeof PaletteIcon }[] = [
	{ id: "appearance", label: "外观", icon: PaletteIcon },
	{ id: "models", label: "模型", icon: Robot2Icon },
	{ id: "archive", label: "存档", icon: FolderMoveIcon },
];

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
			width="56rem"
			placement="center"
			destroyOnClose
			dialogClassName="settings-dialog"
			onClose={onClose}
		>
			<div className="dialog-body">
				<nav className="dialog-nav" aria-label="设置">
					{NAV.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								className={pane === item.id ? "active" : ""}
								aria-current={pane === item.id ? "page" : undefined}
								onClick={() => setPane(item.id)}
							>
								<Icon size="18px" />
								{item.label}
							</button>
						);
					})}
				</nav>
				<div className="dialog-pane">
					{pane === "appearance" ? (
						<div className="settings-page">
							<div className="settings-page-head">
								<h2 className="settings-page-title">外观</h2>
							</div>
							<section className="settings-block">
								<div className="settings-card">
									<p className="dialog-placeholder">外观设置稍后提供。</p>
								</div>
							</section>
						</div>
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
