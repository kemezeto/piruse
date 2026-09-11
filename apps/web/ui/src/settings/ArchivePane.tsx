import { useEffect, useState } from "react";
import type { ViewArchivedSession, ViewSessionOption } from "@protocol/view";
import { ConfirmDialog } from "../dialog/Confirm";
import { relativeTime } from "../format";
import type { HostCommand } from "../socket";

export function ArchivePane({
	sessions,
	archivedSessions,
	currentSessionId,
	running,
	onCommand,
}: {
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	currentSessionId: string;
	running: boolean;
	onCommand: HostCommand;
}) {
	const [pending, setPending] = useState<ViewSessionOption | null>(null);
	return (
		<div className="settings-page">
			<div className="settings-page-head">
				<h2 className="settings-page-title">存档</h2>
				<p className="settings-lead">归档后无法再打开该对话，文件仍保留，直到彻底删除。</p>
			</div>
			<section className="settings-block">
				<h3>当前项目</h3>
				<div className="settings-card settings-card-list">
					{sessions.length === 0 ? <p className="dialog-placeholder">没有可归档的对话。</p> : null}
					{sessions.map((session) => {
						const current = session.id === currentSessionId;
						const disabled = current && running;
						return (
							<div key={session.id} className="archive-row">
								<div className="archive-row-copy">
									<strong>
										{session.title}
										{current ? " · 当前" : ""}
									</strong>
									<span className="archive-row-meta">{relativeTime(session.modifiedAt)}</span>
								</div>
								<div className="archive-row-actions">
									<RenameControl
										title={session.title}
										onSave={(title) => onCommand({ type: "setSessionTitle", sessionId: session.id, title })}
									/>
									<button
										type="button"
										className="archive-btn"
										disabled={disabled}
										title={disabled ? "请先停止当前运行" : undefined}
										onClick={() => setPending(session)}
									>
										归档
									</button>
								</div>
							</div>
						);
					})}
				</div>
			</section>
			<section className="settings-block">
				<h3>已归档</h3>
				<div className="settings-card settings-card-list">
					{archivedSessions.length === 0 ? <p className="dialog-placeholder">没有归档对话。</p> : null}
					{archivedSessions.map((session) => (
						<div key={session.id} className="archive-row">
							<div className="archive-row-copy">
								<strong>{session.title}</strong>
								<span className="archive-row-meta">
									{session.projectName} · {relativeTime(session.archivedAt)}
								</span>
								<span className="archive-row-path" title={session.cwd}>
									{session.cwd}
								</span>
							</div>
							<div className="archive-row-actions">
								<RenameControl
									title={session.title}
									onSave={(title) => onCommand({ type: "setSessionTitle", sessionId: session.id, title })}
								/>
								<button
									type="button"
									className="archive-btn"
									onClick={() => onCommand({ type: "unarchiveSession", sessionId: session.id })}
								>
									撤销归档
								</button>
								<button
									type="button"
									className="archive-btn danger"
									onClick={() => {
										if (!window.confirm(`彻底删除「${session.title}」？此操作不可恢复。`)) return;
										onCommand({ type: "deleteArchivedSession", sessionId: session.id });
									}}
								>
									彻底删除
								</button>
							</div>
						</div>
					))}
				</div>
			</section>
			<ConfirmDialog
				open={Boolean(pending)}
				title="归档对话"
				body={`确认将「${pending?.title ?? ""}」归档吗？归档后可在「设置 · 存档」中查看已归档对话。`}
				confirmLabel="确认归档"
				onCancel={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					onCommand({ type: "archiveSession", sessionId: pending.id });
					setPending(null);
				}}
			/>
		</div>
	);
}

function RenameControl({ title, onSave }: { title: string; onSave: (title: string) => void }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(title);
	useEffect(() => {
		if (!editing) setDraft(title);
	}, [editing, title]);
	if (!editing) {
		return (
			<button type="button" className="archive-btn" onClick={() => setEditing(true)}>
				重命名
			</button>
		);
	}
	return (
		<form
			className="archive-rename"
			onSubmit={(event) => {
				event.preventDefault();
				const next = draft.trim();
				if (!next) return;
				onSave(next);
				setEditing(false);
			}}
		>
			<input value={draft} autoFocus maxLength={80} onChange={(event) => setDraft(event.target.value)} />
			<button type="submit" className="archive-btn">
				保存
			</button>
			<button type="button" className="archive-btn" onClick={() => setEditing(false)}>
				取消
			</button>
		</form>
	);
}
