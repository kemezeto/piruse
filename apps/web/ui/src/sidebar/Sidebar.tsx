import { useEffect, useRef, useState } from "react";
import type { ViewProjectOption } from "@protocol/view";
import { relativeTime } from "../format";

const COLLAPSED_KEY = "piruse.sidebar.collapsed";

export function Sidebar({
	cwd,
	sessionId,
	projects,
	running,
	collapsed,
	onCollapsed,
	onNewChat,
	onOpenProject,
	onOpenSession,
	onSettings,
}: {
	cwd: string;
	sessionId: string;
	projects: ViewProjectOption[];
	running: boolean;
	collapsed: boolean;
	onCollapsed: (collapsed: boolean) => void;
	onNewChat: () => void;
	onOpenProject: (cwd: string) => void;
	onOpenSession: (sessionId: string) => void;
	onSettings: () => void;
}) {
	const [openPath, setOpenPath] = useState(false);
	const [path, setPath] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set([cwd]));
	const addRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setExpanded((current) => {
			if (current.has(cwd)) return current;
			const next = new Set(current);
			next.add(cwd);
			return next;
		});
	}, [cwd]);

	useEffect(() => {
		if (!openPath) return;
		const onPointer = (event: PointerEvent): void => {
			if (!addRef.current?.contains(event.target as Node)) setOpenPath(false);
		};
		window.addEventListener("pointerdown", onPointer);
		return () => window.removeEventListener("pointerdown", onPointer);
	}, [openPath]);

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
					<PanelIcon />
				</button>
				<button
					type="button"
					className="sidebar-new"
					disabled={running}
					title={running ? "请先停止当前运行" : "新建对话"}
					onClick={onNewChat}
				>
					<BranchIcon />
					{collapsed ? null : <span>New Chat</span>}
				</button>
			</div>
			{collapsed ? null : (
				<div className="sidebar-repos">
					<div className="sidebar-repos-head">
						<span>Repositories</span>
						<div className="sidebar-add" ref={addRef}>
							<button
								type="button"
								className="sidebar-icon-btn"
								disabled={running}
								aria-label="打开项目目录"
								title={running ? "请先停止当前运行" : "选择目录开启项目"}
								onClick={() => setOpenPath((current) => !current)}
							>
								<AddFolderIcon />
							</button>
							{openPath ? (
								<form
									className="sidebar-open"
									onSubmit={(event) => {
										event.preventDefault();
										const next = path.trim();
										if (!next) return;
										onOpenProject(next);
										setPath("");
										setOpenPath(false);
									}}
								>
									<input
										value={path}
										autoFocus
										placeholder="项目目录路径…"
										onChange={(event) => setPath(event.target.value)}
									/>
									<button type="submit" disabled={!path.trim()}>
										打开
									</button>
								</form>
							) : null}
						</div>
					</div>
					<div className="sidebar-tree">
						{projects.map((project) => {
							const open = expanded.has(project.cwd);
							return (
								<div key={project.cwd} className="sidebar-project">
									<button
										type="button"
										className={`sidebar-folder${project.cwd === cwd ? " current" : ""}`}
										title={project.cwd}
										onClick={() => toggleProject(project.cwd, project.sessionCount)}
									>
										<FolderIcon />
										<span>{project.name}</span>
									</button>
									{open
										? project.sessions.map((session) => (
												<button
													type="button"
													key={session.id}
													className={`sidebar-chat${session.id === sessionId ? " active" : ""}`}
													disabled={running && session.id !== sessionId}
													title={running && session.id !== sessionId ? "请先停止当前运行" : session.title}
													onClick={() => {
														if (session.id !== sessionId) onOpenSession(session.id);
													}}
												>
													<span>{session.title}</span>
													<time>{relativeTime(session.modifiedAt)}</time>
												</button>
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
				{collapsed ? null : <span className="sidebar-mark">π</span>}
				<button type="button" className="sidebar-settings" aria-label="Settings" title="Settings" onClick={onSettings}>
					<GearIcon />
				</button>
			</div>
		</aside>
	);
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

function PanelIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
			<path d="M6.25 2.25v11.5" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}

function BranchIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="4.2" cy="3.4" r="1.45" stroke="currentColor" strokeWidth="1.3" />
			<circle cx="4.2" cy="12.6" r="1.45" stroke="currentColor" strokeWidth="1.3" />
			<circle cx="11.8" cy="8" r="1.45" stroke="currentColor" strokeWidth="1.3" />
			<path d="M4.2 4.85v6.3M5.55 3.9c2.4.15 4.4 1.7 5.1 3.55" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function AddFolderIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M2.2 4.4h4.1l1.15 1.2H13.8v7.1H2.2V4.4Z"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
			<path d="M9.6 8.2v3.4M7.9 9.9h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
		</svg>
	);
}

function FolderIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M2.2 4.5h4.05l1.1 1.15H13.8v7.05H2.2V4.5Z"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function GearIcon() {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M6.4 1.7h3.2l.35 1.55a4.8 4.8 0 0 1 1.2.7L12.7 3l1.6 2.77-1.2 1.05c.08.4.13.8.13 1.18s-.05.79-.13 1.18l1.2 1.05L12.7 13l-1.55-1.02a4.8 4.8 0 0 1-1.2.7L9.6 14.3H6.4l-.35-1.62a4.8 4.8 0 0 1-1.2-.7L3.3 13 1.7 10.23l1.2-1.05A5.4 5.4 0 0 1 2.77 8c0-.4.05-.79.13-1.18L1.7 5.77 3.3 3l1.55 1.02c.37-.3.77-.53 1.2-.7L6.4 1.7Z"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinejoin="round"
			/>
			<circle cx="8" cy="8" r="2.05" stroke="currentColor" strokeWidth="1.3" />
		</svg>
	);
}
