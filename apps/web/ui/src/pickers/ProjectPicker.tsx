import { FolderIcon } from "tdesign-icons-react";
import { useState } from "react";
import type { ViewProjectOption } from "@protocol/view";
import { basenameOf } from "../format";
import { Menu } from "./Menu";

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
	const name = current?.name ?? (cwd ? basenameOf(cwd) : "选择工作空间");
	return (
		<Menu
			align="left"
			wide
			drop="up"
			variant="inline"
			label="选择工作空间"
			value="选择工作空间"
			hint={cwd ? `${name} · ${cwd}` : "选择工作目录"}
			icon={<FolderIcon size={14} />}
			disabled={running}
		>
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
							placeholder="项目目录路径…"
							onChange={(event) => setPath(event.target.value)}
						/>
						<button type="submit" className="popover-open-go" disabled={!path.trim()}>
							打开
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

