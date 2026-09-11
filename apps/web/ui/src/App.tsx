import { useState } from "react";
import { readAgentKind, writeAgentKind, type AgentKind } from "./agent";
import { SettingsDialog } from "./settings/Settings";
import { readSidebarCollapsed, Sidebar, writeSidebarCollapsed } from "./sidebar/Sidebar";
import { useHost } from "./socket";
import { AnalyseWorkspace } from "./workspace/AnalyseWorkspace";
import { Workspace } from "./workspace/Workspace";

export function App() {
	const { state, notice, line, sendCommand, sendPrompt } = useHost();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
	const [agent, setAgent] = useState(readAgentKind);

	const selectAgent = (next: AgentKind): void => {
		setAgent(next);
		writeAgentKind(next);
	};

	const useCoding = (): void => {
		if (agent !== "coding") selectAgent("coding");
	};

	return (
		<div className={`app${collapsed ? " collapsed" : ""}`}>
			<Sidebar
				agent={agent}
				cwd={state?.cwd ?? ""}
				sessionId={state?.sessionId ?? ""}
				projects={state?.projects ?? []}
				running={Boolean(state?.running)}
				collapsed={collapsed}
				onAgent={selectAgent}
				onCollapsed={(next) => {
					setCollapsed(next);
					writeSidebarCollapsed(next);
				}}
				onNewChat={() => {
					useCoding();
					sendCommand({ type: "newSession" });
				}}
				onOpenProject={(cwd) => {
					useCoding();
					sendCommand({ type: "openProject", cwd });
				}}
				onPickProject={() => {
					useCoding();
					sendCommand({ type: "pickProject" });
				}}
				onOpenSession={(sessionId) => {
					useCoding();
					sendCommand({ type: "openSession", sessionId });
				}}
				onArchive={(sessionId) => sendCommand({ type: "archiveSession", sessionId })}
				onSettings={() => setSettingsOpen(true)}
			/>
			{agent === "analyse" ? (
				<AnalyseWorkspace projects={state?.projects ?? []} models={state?.models ?? []} />
			) : (
				<Workspace state={state} notice={notice} line={line} onCommand={sendCommand} onSend={sendPrompt} />
			)}
			<SettingsDialog
				open={settingsOpen}
				providers={state?.providers ?? []}
				choices={state?.providerChoices ?? []}
				sessions={state?.sessions ?? []}
				archivedSessions={state?.archivedSessions ?? []}
				currentSessionId={state?.sessionId ?? ""}
				running={Boolean(state?.running)}
				skills={state?.packages?.skills ?? []}
				extensions={state?.packages?.extensions ?? []}
				onClose={() => setSettingsOpen(false)}
				onCommand={sendCommand}
			/>
		</div>
	);
}
