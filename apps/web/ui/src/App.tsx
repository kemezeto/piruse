import { useState } from "react";
import { SettingsDialog } from "./settings/Settings";
import { readSidebarCollapsed, Sidebar, writeSidebarCollapsed } from "./sidebar/Sidebar";
import { useHost } from "./socket";
import { Workspace } from "./workspace/Workspace";

export function App() {
	const { state, notice, line, sendCommand, sendPrompt } = useHost();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(readSidebarCollapsed);

	return (
		<div className={`app${collapsed ? " collapsed" : ""}`}>
			<Sidebar
				cwd={state?.cwd ?? ""}
				sessionId={state?.sessionId ?? ""}
				projects={state?.projects ?? []}
				running={Boolean(state?.running)}
				collapsed={collapsed}
				onCollapsed={(next) => {
					setCollapsed(next);
					writeSidebarCollapsed(next);
				}}
				onNewChat={() => sendCommand({ type: "newSession" })}
				onOpenProject={(cwd) => sendCommand({ type: "openProject", cwd })}
				onOpenSession={(sessionId) => sendCommand({ type: "openSession", sessionId })}
				onArchive={(sessionId) => sendCommand({ type: "archiveSession", sessionId })}
				onSettings={() => setSettingsOpen(true)}
			/>
			<Workspace state={state} notice={notice} line={line} onCommand={sendCommand} onSend={sendPrompt} />
			<SettingsDialog
				open={settingsOpen}
				providers={state?.providers ?? []}
				choices={state?.providerChoices ?? []}
				sessions={state?.sessions ?? []}
				archivedSessions={state?.archivedSessions ?? []}
				currentSessionId={state?.sessionId ?? ""}
				running={Boolean(state?.running)}
				onClose={() => setSettingsOpen(false)}
				onCommand={sendCommand}
			/>
		</div>
	);
}
