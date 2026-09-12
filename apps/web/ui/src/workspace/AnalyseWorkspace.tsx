import { useEffect, useState } from "react";
import type { ViewItem, ViewModelOption, ViewPackageItem, ViewProjectOption } from "@protocol/view";
import { Overview } from "../analyse/Overview";
import { SessionInspect } from "../analyse/SessionInspect";
import { Usage } from "../analyse/Usage";
import { Activity } from "../analyse/Activity";
import { Quality } from "../analyse/Quality";

const TABS = [
	{ id: "overview", label: "概览" },
	{ id: "sessions", label: "会话" },
	{ id: "usage", label: "用量" },
	{ id: "activity", label: "活动" },
	{ id: "quality", label: "质量" },
	{ id: "data", label: "数据" },
] as const;

export type AnalyseTabId = (typeof TABS)[number]["id"];

const TAB_KEY = "piruse.analyse.tab";
const TAB_IDS = new Set<string>(TABS.map((tab) => tab.id));

function readAnalyseTab(): AnalyseTabId {
	try {
		const stored = localStorage.getItem(TAB_KEY);
		if (stored && TAB_IDS.has(stored)) return stored as AnalyseTabId;
	} catch {
		return "overview";
	}
	return "overview";
}

function writeAnalyseTab(id: AnalyseTabId): void {
	try {
		localStorage.setItem(TAB_KEY, id);
	} catch {
		return;
	}
}

export function AnalyseWorkspace({
	sessionId,
	sessionTitle,
	cwd,
	items,
	projects,
	models,
	skills,
	inspectNonce,
	onOpenInCoding,
}: {
	sessionId: string;
	sessionTitle: string;
	cwd: string;
	items: ViewItem[];
	projects: ViewProjectOption[];
	models: ViewModelOption[];
	skills: ViewPackageItem[];
	inspectNonce: number;
	onOpenInCoding: () => void;
}) {
	const [tab, setTab] = useState(readAnalyseTab);
	const current = TABS.find((item) => item.id === tab) ?? TABS[0];

	useEffect(() => {
		if (!inspectNonce) return;
		setTab("sessions");
		writeAnalyseTab("sessions");
	}, [inspectNonce]);

	return (
		<main className="workspace analyse-workspace" aria-label="Analyse Agent">
			<header className="analyse-head">
				<nav className="analyse-tabs" role="tablist" aria-label="Analyse 视图">
					{TABS.map((item) => {
						const active = item.id === current.id;
						return (
							<button
								key={item.id}
								type="button"
								role="tab"
								id={`analyse-tab-${item.id}`}
								className={`analyse-tab${active ? " active" : ""}`}
								aria-selected={active}
								onClick={() => {
									setTab(item.id);
									writeAnalyseTab(item.id);
								}}
							>
								{item.label}
							</button>
						);
					})}
				</nav>
			</header>
			<section
				className={`analyse-pane${current.id === "sessions" ? " is-session" : ""}`}
				role="tabpanel"
				aria-labelledby={`analyse-tab-${current.id}`}
			>
				{current.id === "overview" ? <Overview projects={projects} models={models} skills={skills} /> : null}
				{current.id === "sessions" ? (
					<SessionInspect
						key={sessionId}
						sessionId={sessionId}
						sessionTitle={sessionTitle}
						cwd={cwd}
						items={items}
						projects={projects}
						onOpenInCoding={onOpenInCoding}
					/>
				) : null}
				{current.id === "usage" ? <Usage projects={projects} models={models} /> : null}
				{current.id === "activity" ? <Activity projects={projects} models={models} /> : null}
				{current.id === "quality" ? <Quality projects={projects} /> : null}
			</section>
		</main>
	);
}
