import { useEffect, useState } from "react";
import { AnalyticsIcon, ChatBubbleHelpIcon, ChevronRightIcon, CodeIcon, DeleteIcon, FolderAddIcon, FolderIcon, FolderOpen1Icon, MenuFoldIcon, MenuUnfoldIcon, SettingIcon } from "tdesign-icons-react";
import type { ViewProjectOption, ViewSessionOption } from "@protocol/view";
import type { AgentKind } from "../agent";
import { ConfirmDialog } from "../dialog/Confirm";
import logo from "../view/logo.png";
import { ChatRow } from "./ChatRow";

const COLLAPSED_KEY = "piruse.sidebar.collapsed";

export function Sidebar({
	agent,
	cwd,
	sessionId,
	projects,
	running,
	collapsed,
	onAgent,
	onCollapsed,
	onNewChat,
	onOpenProject,
	onPickProject,
	onDeleteProject,
	onOpenSession,
	onArchive,
	onSettings,
}: {
	agent: AgentKind;
	cwd: string;
	sessionId: string;
	projects: ViewProjectOption[];
	running: boolean;
	collapsed: boolean;
	onAgent: (agent: AgentKind) => void;
	onCollapsed: (collapsed: boolean) => void;
	onNewChat: () => void;
	onOpenProject: (cwd: string) => void;
	onPickProject: () => void;
	onDeleteProject: (cwd: string) => void;
	onOpenSession: (sessionId: string) => void;
	onArchive: (sessionId: string) => void;
	onSettings: () => void;
}) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set([cwd]));
	const [pending, setPending] = useState<ViewSessionOption | null>(null);
	const [pendingProject, setPendingProject] = useState<ViewProjectOption | null>(null);
	const now = useClock();

	useEffect(() => {
		setExpanded((current) => {
			if (current.has(cwd)) return current;
			const next = new Set(current);
			next.add(cwd);
			return next;
		});
	}, [cwd]);

	const toggleProject = (projectCwd: string, sessionCount: number): void => {
		setExpanded((current) => {
			const next = new Set(current);
			if (next.has(projectCwd)) next.delete(projectCwd);
			else next.add(projectCwd);
			return next;
		});
		if (sessionCount === 0 && projectCwd !== cwd && !running) onOpenProject(projectCwd);
	};

	return (
		<aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
			<div className="sidebar-top">
				<button
					type="button"
					className="sidebar-icon-btn"
					aria-label={collapsed ? "展开菜单" : "收缩菜单"}
					title={collapsed ? "展开菜单" : "收缩菜单"}
					onClick={() => onCollapsed(!collapsed)}
				>
					{collapsed ? <MenuUnfoldIcon size={16} /> : <MenuFoldIcon size={16} />}
				</button>
				<div className="sidebar-agents" role="group" aria-label="切换 Agent">
					<button
						type="button"
						className={`sidebar-agent${agent === "coding" ? " active" : ""}`}
						aria-pressed={agent === "coding"}
						title="Coding Agent"
						onClick={() => onAgent("coding")}
					>
						<CodeIcon size={16} />
						{collapsed ? null : <span>Coding</span>}
					</button>
					<button
						type="button"
						className={`sidebar-agent${agent === "analyse" ? " active" : ""}`}
						aria-pressed={agent === "analyse"}
						title="Analyse Agent"
						onClick={() => onAgent("analyse")}
					>
						<AnalyticsIcon size={16} />
						{collapsed ? null : <span>Analyse</span>}
					</button>
				</div>
				<button
					type="button"
					className="sidebar-new"
					disabled={running}
					title={running ? "请先停止当前运行" : "新建对话"}
					onClick={onNewChat}
				>
					<ChatBubbleHelpIcon size={16} />
					{collapsed ? null : <span>New Chat</span>}
				</button>
			</div>
			{collapsed ? null : (
				<div className="sidebar-repos">
					<div className="sidebar-repos-head">
						<span>Repositories</span>
						<button
							type="button"
							className="sidebar-icon-btn"
							disabled={running}
							aria-label="打开项目目录"
							title={running ? "请先停止当前运行" : "选择文件夹开启项目"}
							onClick={onPickProject}
						>
							<FolderAddIcon size={16} />
						</button>
					</div>
					<div className="sidebar-tree">
						{projects.map((project) => {
							const open = expanded.has(project.cwd);
							return (
								<div key={project.cwd} className="sidebar-project">
									<div
										className={`sidebar-folder${project.cwd === cwd ? " current" : ""}${open ? " open" : ""}`}
										title={project.cwd}
									>
										<button
											type="button"
											className="sidebar-folder-open"
											aria-expanded={open}
											onClick={() => toggleProject(project.cwd, project.sessionCount)}
										>
											{open ? <FolderOpen1Icon size={14} /> : <FolderIcon size={14} />}
											<span>{project.name}</span>
										</button>
										<button
											type="button"
											className="sidebar-project-delete"
											aria-label={`删除项目 ${project.name}`}
											title={running && project.cwd === cwd ? "请先停止当前运行" : "删除项目"}
											disabled={running && project.cwd === cwd}
											onClick={() => setPendingProject(project)}
										>
											<DeleteIcon size={14} />
										</button>
										<button
											type="button"
											className="sidebar-folder-caret"
											aria-expanded={open}
											aria-label={open ? "收起项目" : "展开项目"}
											onClick={() => toggleProject(project.cwd, project.sessionCount)}
										>
											<ChevronRightIcon size={14} className={`caret${open ? " open" : ""}`} />
										</button>
									</div>
									{open
										? project.sessions.map((session) => (
												<ChatRow
													key={session.id}
													session={session}
													active={session.id === sessionId}
													running={running}
													now={now}
													onOpen={() => {
														if (agent === "analyse" || session.id !== sessionId) onOpenSession(session.id);
													}}
													onArchive={() => setPending(session)}
												/>
											))
										: null}
									{open && project.sessions.length === 0 ? (
										<p className="sidebar-empty">没有对话</p>
									) : null}
								</div>
							);
						})}
					</div>
				</div>
			)}
			<div className="sidebar-foot">
				{collapsed ? null : <img className="sidebar-mark" src={logo} alt="" />}
				<button type="button" className="sidebar-settings" aria-label="Settings" title="Settings" onClick={onSettings}>
					<SettingIcon size={16} />
				</button>
			</div>
			<ConfirmDialog
				open={Boolean(pendingProject)}
				title="删除项目"
				body={`确认删除项目「${pendingProject?.name ?? ""}」？该项目下的全部对话（包括已归档）会被永久删除。项目文件夹本身不会从磁盘移除。`}
				confirmLabel="删除项目"
				danger
				onCancel={() => setPendingProject(null)}
				onConfirm={() => {
					if (!pendingProject) return;
					onDeleteProject(pendingProject.cwd);
					setPendingProject(null);
				}}
			/>
			<ConfirmDialog
				open={Boolean(pending)}
				title="归档对话"
				body={`确认将「${pending?.title ?? ""}」归档吗？归档后可在「设置 · 存档」中查看已归档对话。`}
				confirmLabel="确认归档"
				onCancel={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					onArchive(pending.id);
					setPending(null);
				}}
			/>
		</aside>
	);
}

function useClock(): number {
	const [now, setNow] = useState(Date.now);
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, []);
	return now;
}

export function readSidebarCollapsed(): boolean {
	try {
		return localStorage.getItem(COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

export function writeSidebarCollapsed(collapsed: boolean): void {
	try {
		localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
	} catch {
		return;
	}
}

