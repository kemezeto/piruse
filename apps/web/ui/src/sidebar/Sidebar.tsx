import { useEffect, useRef, useState } from "react";
import { ChatBubbleHelpIcon, ChevronRightIcon, FolderAddIcon, FolderIcon, FolderOpen1Icon, MenuFoldIcon, MenuUnfoldIcon, SettingIcon } from "tdesign-icons-react";
import type { ViewProjectOption, ViewSessionOption } from "@protocol/view";
import { ConfirmDialog } from "../dialog/Confirm";
import logo from "../view/logo.png";
import { ChatRow } from "./ChatRow";

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
	onArchive,
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
	onArchive: (sessionId: string) => void;
	onSettings: () => void;
}) {
	const [openPath, setOpenPath] = useState(false);
	const [path, setPath] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set([cwd]));
	const [pending, setPending] = useState<ViewSessionOption | null>(null);
	const now = useClock();
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
					{collapsed ? <MenuUnfoldIcon size={16} /> : <MenuFoldIcon size={16} />}
				</button>
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
						<div className="sidebar-add" ref={addRef}>
							<button
								type="button"
								className="sidebar-icon-btn"
								disabled={running}
								aria-label="打开项目目录"
								title={running ? "请先停止当前运行" : "选择目录开启项目"}
								onClick={() => setOpenPath((current) => !current)}
							>
								<FolderAddIcon size={16} />
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
										className={`sidebar-folder${project.cwd === cwd ? " current" : ""}${open ? " open" : ""}`}
										title={project.cwd}
										aria-expanded={open}
										onClick={() => toggleProject(project.cwd, project.sessionCount)}
									>
										{open ? <FolderOpen1Icon size={14} /> : <FolderIcon size={14} />}
										<span>{project.name}</span>
										<ChevronRightIcon size={14} className={`caret${open ? " open" : ""}`} />
									</button>
									{open
										? project.sessions.map((session) => (
												<ChatRow
													key={session.id}
													session={session}
													active={session.id === sessionId}
													running={running}
													now={now}
													onOpen={() => {
														if (session.id !== sessionId) onOpenSession(session.id);
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

