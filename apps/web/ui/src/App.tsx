import { useEffect, useState } from "react";
import { readAgentKind, writeAgentKind, type AgentKind } from "./agent";
import { SettingsDialog } from "./settings/Settings";
import { readSidebarCollapsed, Sidebar, writeSidebarCollapsed } from "./sidebar/Sidebar";
import { useHost } from "./socket";
import { AnalyseWorkspace } from "./workspace/AnalyseWorkspace";
import { Workspace } from "./workspace/Workspace";

export function App() {
	const { state, analyse, notice, line, sendCommand, sendPrompt, reloadAnalyse } = useHost();
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
	const [agent, setAgent] = useState(readAgentKind);
	const [inspectNonce, setInspectNonce] = useState(0);

	const selectAgent = (next: AgentKind): void => {
		setAgent(next);
		writeAgentKind(next);
	};

	const useCoding = (): void => {
		if (agent !== "coding") selectAgent("coding");
	};

	useEffect(() => {
		if (agent !== "analyse" || line !== "live") return;
		reloadAnalyse();
	}, [agent, line, reloadAnalyse]);

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
				onOpenSession={(id) => {
					if (agent === "analyse") {
						setInspectNonce((value) => value + 1);
						if (id !== state?.sessionId) sendCommand({ type: "openSession", sessionId: id });
						return;
					}
					useCoding();
					sendCommand({ type: "openSession", sessionId: id });
				}}
				onArchive={(sessionId) => sendCommand({ type: "archiveSession", sessionId })}
				onSettings={() => setSettingsOpen(true)}
			/>
			{agent === "analyse" ? (
				<AnalyseWorkspace
					sessionId={state?.sessionId ?? ""}
					sessionTitle={state?.sessionTitle ?? ""}
					cwd={state?.cwd ?? ""}
					items={state?.items ?? []}
					projects={state?.projects ?? []}
					models={state?.models ?? []}
					snapshot={analyse}
					inspectNonce={inspectNonce}
					onReload={reloadAnalyse}
					onOpenInCoding={useCoding}
				/>
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
