import { useState } from "react";
import { EducationIcon, ExtensionIcon, FolderMoveIcon, Robot2Icon } from "tdesign-icons-react";
import { Dialog } from "tdesign-react";
import type {
	ViewArchivedSession,
	ViewPackageItem,
	ViewProviderChoice,
	ViewProviderOption,
	ViewSessionOption,
} from "@protocol/view";
import type { HostCommand } from "../socket";
import { ArchivePane } from "./ArchivePane";
import { ModelsPane } from "./ModelsPane";
import { PackagesPane } from "./PackagesPane";

type Pane = "models" | "extensions" | "skills" | "archive";

const NAV: { id: Pane; label: string; icon: typeof Robot2Icon }[] = [
	{ id: "models", label: "模型", icon: Robot2Icon },
	{ id: "extensions", label: "扩展", icon: ExtensionIcon },
	{ id: "skills", label: "技能", icon: EducationIcon },
	{ id: "archive", label: "存档", icon: FolderMoveIcon },
];

export function SettingsDialog({
	open,
	providers,
	choices,
	current,
	sessions,
	archivedSessions,
	currentSessionId,
	running,
	skills,
	extensions,
	onClose,
	onCommand,
}: {
	open: boolean;
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	current: { provider: string; modelId: string } | null;
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	currentSessionId: string;
	running: boolean;
	skills: ViewPackageItem[];
	extensions: ViewPackageItem[];
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
					{pane === "archive" ? (
						<ArchivePane
							sessions={sessions}
							archivedSessions={archivedSessions}
							currentSessionId={currentSessionId}
							running={running}
							onCommand={onCommand}
						/>
					) : pane === "extensions" ? (
						<PackagesPane
							title="扩展"
							lead="查看已安装的扩展。安装和卸载请在终端使用 pi install / pi uninstall，这里只启用或禁用。"
							empty="还没有安装扩展。在终端运行 pi install 后回到这里管理。"
							items={extensions}
							running={running}
							kind="extension"
							onCommand={onCommand}
						/>
					) : pane === "skills" ? (
						<PackagesPane
							title="技能"
							lead="查看已安装的技能。安装和卸载请在终端使用 pi install / pi uninstall，这里只启用或禁用。"
							empty="还没有安装技能。在终端运行 pi install 或把 SKILL.md 放到 ~/.pi/agent/skills 后回到这里管理。"
							items={skills}
							running={running}
							kind="skill"
							onCommand={onCommand}
						/>
					) : (
						<ModelsPane providers={providers} choices={choices} current={current} onCommand={onCommand} />
					)}
				</div>
			</div>
		</Dialog>
	);
}
