import { useState } from "react";
import type { ViewModelOption, ViewProjectOption } from "@protocol/view";
import { Overview } from "../analyse/Overview";

const TABS = [
	{ id: "overview", label: "概览" },
	{ id: "sessions", label: "会话" },
	{ id: "usage", label: "用量" },
	{ id: "activity", label: "活动" },
	{ id: "trends", label: "趋势" },
	{ id: "quality", label: "质量" },
	{ id: "recent", label: "最近编辑" },
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
	projects,
	models,
}: {
	projects: ViewProjectOption[];
	models: ViewModelOption[];
}) {
	const [tab, setTab] = useState(readAnalyseTab);
	const current = TABS.find((item) => item.id === tab) ?? TABS[0];

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
				className="analyse-pane"
				role="tabpanel"
				aria-labelledby={`analyse-tab-${current.id}`}
			>
				{current.id === "overview" ? <Overview projects={projects} models={models} /> : null}
			</section>
		</main>
	);
}
