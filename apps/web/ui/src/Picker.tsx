import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
	PermissionMode,
	ViewApproval,
	ViewModelOption,
	ViewProjectOption,
	ViewSessionOption,
} from "@protocol/view";

export function relativeTime(ms: number): string {
	const delta = Date.now() - ms;
	const minutes = Math.floor(delta / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d`;
	return new Date(ms).toLocaleDateString();
}

function Menu({
	align = "right",
	wide = false,
	label,
	value,
	hint,
	disabled,
	children,
}: {
	align?: "left" | "right";
	wide?: boolean;
	label: string;
	value: string;
	hint?: string;
	disabled?: boolean;
	children: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent): void => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onPointer);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onPointer);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className={`menu${open ? " open" : ""}`} ref={rootRef}>
			<button
				type="button"
				className="menu-btn"
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label}
				title={disabled ? "Stop the run first" : hint ?? value}
				onClick={() => setOpen((current) => !current)}
			>
				<span className="menu-label">{label}</span>
				<span className="menu-value">{value}</span>
			</button>
			{open ? <div className={`popover ${align}${wide ? " wide" : ""}`}>{children(() => setOpen(false))}</div> : null}
		</div>
	);
}

export function ProjectPicker({
	cwd,
	projects,
	running,
	onOpen,
}: {
	cwd: string;
	projects: ViewProjectOption[];
	running: boolean;
	onOpen: (cwd: string) => void;
}) {
	const [path, setPath] = useState("");
	const current = projects.find((project) => project.cwd === cwd);
	const label = current?.name ?? basenameOf(cwd);
	return (
		<Menu align="right" wide label="Project" value={label} hint={cwd} disabled={running}>
			{(close) => (
				<>
					<form
						className="popover-open"
						onSubmit={(event) => {
							event.preventDefault();
							const next = path.trim();
							if (!next) return;
							onOpen(next);
							setPath("");
							close();
						}}
					>
						<input
							className="popover-search"
							value={path}
							autoFocus
							placeholder="Open folder path…"
							onChange={(event) => setPath(event.target.value)}
						/>
						<button type="submit" className="popover-open-go" disabled={!path.trim()}>
							Open
						</button>
					</form>
					<div className="popover-list" role="listbox" aria-label="Projects">
						{projects.length === 0 ? <p className="popover-empty">No recent projects</p> : null}
						{projects.map((project) => (
							<button
								type="button"
								key={project.cwd}
								role="option"
								aria-selected={project.cwd === cwd}
								className={`popover-item${project.cwd === cwd ? " active" : ""}`}
								title={project.cwd}
								onClick={() => {
									if (project.cwd !== cwd) onOpen(project.cwd);
									close();
								}}
							>
								<span className="popover-item-copy">
									<span className="popover-item-title">{project.name}</span>
									<span className="popover-item-path">{project.cwd}</span>
								</span>
								<span className="popover-item-meta">
									{project.sessionCount} {project.sessionCount === 1 ? "chat" : "chats"}
								</span>
							</button>
						))}
					</div>
				</>
			)}
		</Menu>
	);
}

function basenameOf(cwd: string): string {
	const parts = cwd.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? cwd;
}

export function SessionPicker({
	currentId,
	title,
	sessions,
	running,
	onOpen,
	onNew,
	onArchive,
	onRename,
}: {
	currentId: string;
	title: string;
	sessions: ViewSessionOption[];
	running: boolean;
	onOpen: (sessionId: string) => void;
	onNew: () => void;
	onArchive: () => void;
	onRename: (sessionId: string, title: string) => void;
}) {
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const startRename = (sessionId: string, current: string): void => {
		setRenamingId(sessionId);
		setDraft(current);
	};
	const saveRename = (): void => {
		const next = draft.trim();
		if (renamingId && next) onRename(renamingId, next);
		setRenamingId(null);
	};
	return (
		<Menu align="right" label="Chat" value={title} disabled={running}>
			{(close) => (
				<>
					<button
						type="button"
						className="popover-new"
						onClick={() => {
							onNew();
							close();
						}}
					>
						New chat
					</button>
					<button
						type="button"
						className="popover-new"
						onClick={() => {
							onArchive();
							close();
						}}
					>
						归档当前对话
					</button>
					<button type="button" className="popover-new" onClick={() => startRename(currentId, title)}>
						重命名当前对话
					</button>
					{renamingId ? (
						<form
							className="popover-open"
							onSubmit={(event) => {
								event.preventDefault();
								saveRename();
							}}
						>
							<input
								className="popover-search"
								value={draft}
								autoFocus
								maxLength={80}
								placeholder="对话标题"
								onChange={(event) => setDraft(event.target.value)}
							/>
							<button type="submit" className="popover-open-go" disabled={!draft.trim()}>
								保存
							</button>
						</form>
					) : null}
					<div className="popover-list" role="listbox" aria-label="Chats">
						{sessions.length === 0 ? <p className="popover-empty">No chats in this project</p> : null}
						{sessions.map((session) => (
							<div key={session.id} className={`popover-item-row${session.id === currentId ? " active" : ""}`}>
								<button
									type="button"
									role="option"
									aria-selected={session.id === currentId}
									className={`popover-item${session.id === currentId ? " active" : ""}`}
									onClick={() => {
										if (session.id !== currentId) onOpen(session.id);
										close();
									}}
								>
									<span className="popover-item-title">{session.title}</span>
									<span className="popover-item-meta">{relativeTime(session.modifiedAt)}</span>
								</button>
								<button
									type="button"
									className="popover-item-edit"
									title="重命名"
									onClick={() => startRename(session.id, session.title)}
								>
									改
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</Menu>
	);
}

export function ModelPicker({
	current,
	models,
	onSelect,
}: {
	current: { provider: string; modelId: string };
	models: ViewModelOption[];
	onSelect: (model: ViewModelOption) => void;
}) {
	const [query, setQuery] = useState("");
	const groups = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const filtered = needle
			? models.filter((model) =>
					`${model.provider} ${model.modelId} ${model.name}`.toLowerCase().includes(needle),
				)
			: models;
		const byProvider = new Map<string, ViewModelOption[]>();
		for (const model of filtered) {
			const list = byProvider.get(model.provider) ?? [];
			list.push(model);
			byProvider.set(model.provider, list);
		}
		return [...byProvider];
	}, [models, query]);

	return (
		<Menu align="right" label="Model" value={current.modelId}>
			{(close) => (
				<>
					<input
						className="popover-search"
						value={query}
						autoFocus
						placeholder="Search models"
						onChange={(event) => setQuery(event.target.value)}
					/>
					<div className="popover-list" role="listbox" aria-label="Models">
						{groups.length === 0 ? <p className="popover-empty">No matching models</p> : null}
						{groups.map(([provider, entries]) => (
							<div key={provider} className="popover-group">
								<div className="popover-group-label">{provider}</div>
								{entries.map((model) => {
									const selected = model.provider === current.provider && model.modelId === current.modelId;
									return (
										<button
											type="button"
											key={`${model.provider}/${model.modelId}`}
											role="option"
											aria-selected={selected}
											className={`popover-item${selected ? " active" : ""}`}
											onClick={() => {
												if (!selected) onSelect(model);
												close();
											}}
										>
											<span className="popover-item-title">{model.name}</span>
											<span className="popover-item-meta">{model.modelId}</span>
										</button>
									);
								})}
							</div>
						))}
					</div>
				</>
			)}
		</Menu>
	);
}

const PERMISSIONS: { mode: PermissionMode; label: string; hint: string }[] = [
	{ mode: "read", label: "只读", hint: "只读代码，不写文件、不跑命令" },
	{ mode: "review", label: "审核", hint: "改文件或跑命令前询问" },
	{ mode: "allow", label: "允许", hint: "改文件和命令直接执行；删除/回滚/强推仍会问" },
];

export function PermissionPicker({
	mode,
	onSelect,
}: {
	mode: PermissionMode;
	onSelect: (mode: PermissionMode) => void;
}) {
	return (
		<Menu align="right" wide label="权限" value={PERMISSIONS.find((entry) => entry.mode === mode)?.label ?? mode}>
			{(close) => (
				<div className="popover-list" role="listbox" aria-label="Permission mode">
					{PERMISSIONS.map((entry) => (
						<button
							type="button"
							key={entry.mode}
							role="option"
							aria-selected={entry.mode === mode}
							className={`popover-item${entry.mode === mode ? " active" : ""}`}
							onClick={() => {
								if (entry.mode !== mode) onSelect(entry.mode);
								close();
							}}
						>
							<span className="popover-item-copy">
								<span className="popover-item-title">{entry.label}</span>
								<span className="popover-item-path">{entry.hint}</span>
							</span>
						</button>
					))}
				</div>
			)}
		</Menu>
	);
}

function reasonLabel(reason: ViewApproval["reason"]): string {
	if (reason === "mutate") return "改文件";
	if (reason === "dangerous") return "危险命令";
	return "跑命令";
}

export function ApprovalList({
	items,
	onAllow,
	onDeny,
}: {
	items: ViewApproval[];
	onAllow: (id: string) => void;
	onDeny: (id: string) => void;
}) {
	if (items.length === 0) return null;
	return (
		<div className="approvals">
			{items.map((item) => (
				<div className={`approval${item.reason === "dangerous" ? " danger" : ""}`} key={item.id}>
					<div className="approval-copy">
						<span className="approval-kicker">{reasonLabel(item.reason)}</span>
						<span className="approval-name">{item.toolName}</span>
						<span className="approval-args">{item.args}</span>
					</div>
					<div className="approval-actions">
						<button type="button" className="approval-deny" onClick={() => onDeny(item.id)}>
							拒绝
						</button>
						<button type="button" className="approval-allow" onClick={() => onAllow(item.id)}>
							允许
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
