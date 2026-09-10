import { useEffect, useState } from "react";
import type {
	ViewArchivedSession,
	ViewProviderChoice,
	ViewProviderOption,
	ViewSessionOption,
} from "@protocol/view";
import { relativeTime } from "./Picker";

const APIS = [
	{ id: "openai-completions", label: "OpenAI Compatible" },
	{ id: "openai-responses", label: "OpenAI Responses" },
	{ id: "anthropic-messages", label: "Anthropic Messages" },
	{ id: "google-generative-ai", label: "Google Generative AI" },
];

type Pane = "appearance" | "models" | "archive";

export function SettingsButton({ onClick }: { onClick: () => void }) {
	return (
		<button type="button" className="settings-fab" aria-label="Settings" title="Settings" onClick={onClick}>
			<GearIcon />
		</button>
	);
}

export function SettingsDialog({
	open,
	providers,
	choices,
	sessions,
	archivedSessions,
	currentSessionId,
	running,
	onClose,
	onCommand,
}: {
	open: boolean;
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	sessions: ViewSessionOption[];
	archivedSessions: ViewArchivedSession[];
	currentSessionId: string;
	running: boolean;
	onClose: () => void;
	onCommand: (payload: object) => void;
}) {
	const [pane, setPane] = useState<Pane>("models");

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="dialog-root">
			<button type="button" className="dialog-scrim" aria-label="Close settings" onClick={onClose} />
			<div className="dialog" role="dialog" aria-labelledby="settings-title">
				<header className="dialog-head">
					<h2 id="settings-title">Settings</h2>
					<button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
						<CloseIcon />
					</button>
				</header>
				<div className="dialog-body">
					<nav className="dialog-nav" aria-label="Settings">
						<button type="button" className={pane === "appearance" ? "active" : ""} onClick={() => setPane("appearance")}>
							外观
						</button>
						<button type="button" className={pane === "models" ? "active" : ""} onClick={() => setPane("models")}>
							模型
						</button>
						<button type="button" className={pane === "archive" ? "active" : ""} onClick={() => setPane("archive")}>
							存档
						</button>
					</nav>
					<div className="dialog-pane">
						{pane === "appearance" ? (
							<p className="dialog-placeholder">外观设置稍后提供。</p>
						) : pane === "archive" ? (
							<ArchivePane
								sessions={sessions}
								archivedSessions={archivedSessions}
								currentSessionId={currentSessionId}
								running={running}
								onCommand={onCommand}
							/>
						) : (
							<ModelsPane providers={providers} choices={choices} onCommand={onCommand} />
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

function ArchivePane({
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
	onCommand: (payload: object) => void;
}) {
	return (
		<div className="settings-models">
			<p className="dialog-placeholder">归档后无法再打开该对话，文件仍保留，直到彻底删除。</p>
			<section>
				<h3>当前项目</h3>
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
								<button
									type="button"
									className="archive-btn"
									disabled={disabled}
									title={disabled ? "请先停止当前运行" : undefined}
									onClick={() => onCommand({ type: "archiveSession", sessionId: session.id })}
								>
									归档
								</button>
							</div>
						</div>
					);
				})}
			</section>
			<section>
				<h3>已归档</h3>
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
			</section>
		</div>
	);
}

function ModelsPane({
	providers,
	choices,
	onCommand,
}: {
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	onCommand: (payload: object) => void;
}) {
	return (
		<div className="settings-models">
			<section>
				<h3>已配置</h3>
				{providers.length === 0 ? <p className="dialog-placeholder">还没有可用的服务商。添加密钥或自定义服务商。</p> : null}
				{providers.map((provider) => (
					<div key={provider.id} className="provider-card">
						<div className="provider-card-head">
							<strong>{provider.name}</strong>
							<span className="provider-meta">
								{provider.custom ? "自定义" : provider.id}
								{provider.authenticated ? " · 已认证" : " · 未认证"}
							</span>
						</div>
						{provider.baseUrl ? <p className="provider-url">{provider.baseUrl}</p> : null}
						<ul className="model-chips">
							{provider.models.map((model) => (
								<li key={model.id} className={model.custom ? "custom" : undefined}>
									{model.name}
									<span>{model.id}</span>
								</li>
							))}
						</ul>
					</div>
				))}
			</section>
			<AddProviderForm onSubmit={(payload) => onCommand({ type: "addProvider", ...payload })} />
			<SetKeyForm choices={choices} onSubmit={(payload) => onCommand({ type: "setProviderKey", ...payload })} />
			<AddModelForm
				providers={providers.length > 0 ? providers : choices}
				onSubmit={(payload) => onCommand({ type: "addModel", ...payload })}
			/>
		</div>
	);
}

function AddProviderForm({
	onSubmit,
}: {
	onSubmit: (payload: { id: string; name: string; baseUrl: string; api: string; apiKey: string }) => void;
}) {
	const [id, setId] = useState("");
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [api, setApi] = useState("openai-completions");
	const [apiKey, setApiKey] = useState("");
	return (
		<section>
			<h3>添加服务商</h3>
			<form
				className="settings-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (!id.trim() || !baseUrl.trim() || !apiKey.trim()) return;
					onSubmit({ id: id.trim(), name: name.trim(), baseUrl: baseUrl.trim(), api, apiKey: apiKey.trim() });
					setApiKey("");
				}}
			>
				<label>
					ID
					<input value={id} onChange={(event) => setId(event.target.value)} placeholder="ollama" required />
				</label>
				<label>
					显示名
					<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ollama" />
				</label>
				<label className="span-2">
					Base URL
					<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:11434/v1" required />
				</label>
				<label>
					API
					<select value={api} onChange={(event) => setApi(event.target.value)}>
						{APIS.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.label}
							</option>
						))}
					</select>
				</label>
				<label>
					API Key
					<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="不会回传到页面" required />
				</label>
				<button type="submit" className="settings-submit">
					保存服务商
				</button>
			</form>
		</section>
	);
}

function SetKeyForm({
	choices,
	onSubmit,
}: {
	choices: ViewProviderChoice[];
	onSubmit: (payload: { provider: string; apiKey: string }) => void;
}) {
	const [provider, setProvider] = useState(choices[0]?.id ?? "");
	useEffect(() => {
		if (!provider && choices[0]) setProvider(choices[0].id);
	}, [choices, provider]);
	const [apiKey, setApiKey] = useState("");
	return (
		<section>
			<h3>为已有服务商填写密钥</h3>
			<form
				className="settings-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (!provider || !apiKey.trim()) return;
					onSubmit({ provider, apiKey: apiKey.trim() });
					setApiKey("");
				}}
			>
				<label>
					服务商
					<select value={provider} onChange={(event) => setProvider(event.target.value)}>
						{choices.map((choice) => (
							<option key={choice.id} value={choice.id}>
								{choice.name}
							</option>
						))}
					</select>
				</label>
				<label>
					API Key
					<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required />
				</label>
				<button type="submit" className="settings-submit">
					保存密钥
				</button>
			</form>
		</section>
	);
}

function AddModelForm({
	providers,
	onSubmit,
}: {
	providers: Array<{ id: string; name: string }>;
	onSubmit: (payload: { provider: string; modelId: string; name: string; reasoning: boolean; contextWindow?: number }) => void;
}) {
	const [provider, setProvider] = useState(providers[0]?.id ?? "");
	useEffect(() => {
		if (!provider && providers[0]) setProvider(providers[0].id);
	}, [providers, provider]);
	const [modelId, setModelId] = useState("");
	const [name, setName] = useState("");
	const [reasoning, setReasoning] = useState(false);
	const [contextWindow, setContextWindow] = useState("");
	return (
		<section>
			<h3>新建模型</h3>
			<form
				className="settings-form"
				onSubmit={(event) => {
					event.preventDefault();
					if (!provider || !modelId.trim()) return;
					const windowSize = Number(contextWindow);
					onSubmit({
						provider,
						modelId: modelId.trim(),
						name: name.trim(),
						reasoning,
						contextWindow: Number.isFinite(windowSize) && windowSize > 0 ? windowSize : undefined,
					});
					setModelId("");
					setName("");
				}}
			>
				<label>
					服务商
					<select value={provider} onChange={(event) => setProvider(event.target.value)}>
						{providers.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.name}
							</option>
						))}
					</select>
				</label>
				<label>
					模型 ID
					<input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="llama3.1:8b" required />
				</label>
				<label>
					显示名
					<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Llama 3.1 8B" />
				</label>
				<label>
					Context window
					<input value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} placeholder="128000" inputMode="numeric" />
				</label>
				<label className="check">
					<input type="checkbox" checked={reasoning} onChange={(event) => setReasoning(event.target.checked)} />
					支持 reasoning
				</label>
				<button type="submit" className="settings-submit">
					添加模型
				</button>
			</form>
		</section>
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

function CloseIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
			<path d="M3 3l8 8M11 3 3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}
