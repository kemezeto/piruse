import { type ReactNode, useEffect, useState } from "react";
import { Switch } from "tdesign-react";
import type { ViewProviderChoice, ViewProviderOption } from "@protocol/view";
import type { HostCommand } from "../socket";

const APIS = [
	{ id: "openai-completions", label: "OpenAI Compatible" },
	{ id: "openai-responses", label: "OpenAI Responses" },
	{ id: "anthropic-messages", label: "Anthropic Messages" },
	{ id: "google-generative-ai", label: "Google Generative AI" },
];

export function ModelsPane({
	providers,
	choices,
	onCommand,
}: {
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	onCommand: HostCommand;
}) {
	return (
		<div className="settings-page">
			<div className="settings-page-head">
				<h2 className="settings-page-title">模型</h2>
			</div>
			<section className="settings-block">
				<h3>已配置</h3>
				{providers.length === 0 ? (
					<div className="settings-card">
						<p className="dialog-placeholder">还没有可用的服务商。添加密钥或自定义服务商。</p>
					</div>
				) : (
					<div className="settings-stack">
						{providers.map((provider) => (
							<div key={provider.id} className="settings-card provider-card">
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
					</div>
				)}
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

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<label className="settings-row">
			<span className="settings-row-copy">
				<strong>{label}</strong>
				{hint ? <span>{hint}</span> : null}
			</span>
			<span className="settings-row-control">{children}</span>
		</label>
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
		<section className="settings-block">
			<h3>添加服务商</h3>
			<div className="settings-card">
				<form
					className="settings-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!id.trim() || !baseUrl.trim() || !apiKey.trim()) return;
						onSubmit({ id: id.trim(), name: name.trim(), baseUrl: baseUrl.trim(), api, apiKey: apiKey.trim() });
						setApiKey("");
					}}
				>
					<Field label="ID">
						<input value={id} onChange={(event) => setId(event.target.value)} placeholder="ollama" required />
					</Field>
					<Field label="显示名">
						<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ollama" />
					</Field>
					<Field label="Base URL">
						<input
							value={baseUrl}
							onChange={(event) => setBaseUrl(event.target.value)}
							placeholder="http://127.0.0.1:11434/v1"
							required
						/>
					</Field>
					<Field label="API">
						<select value={api} onChange={(event) => setApi(event.target.value)}>
							{APIS.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.label}
								</option>
							))}
						</select>
					</Field>
					<Field label="API Key" hint="不会回传到页面">
						<input
							type="password"
							value={apiKey}
							onChange={(event) => setApiKey(event.target.value)}
							placeholder="sk-…"
							required
						/>
					</Field>
					<div className="settings-form-actions">
						<button type="submit" className="settings-submit">
							保存服务商
						</button>
					</div>
				</form>
			</div>
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
		<section className="settings-block">
			<h3>为已有服务商填写密钥</h3>
			<div className="settings-card">
				<form
					className="settings-form"
					onSubmit={(event) => {
						event.preventDefault();
						if (!provider || !apiKey.trim()) return;
						onSubmit({ provider, apiKey: apiKey.trim() });
						setApiKey("");
					}}
				>
					<Field label="服务商">
						<select value={provider} onChange={(event) => setProvider(event.target.value)}>
							{choices.map((choice) => (
								<option key={choice.id} value={choice.id}>
									{choice.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="API Key">
						<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required />
					</Field>
					<div className="settings-form-actions">
						<button type="submit" className="settings-submit">
							保存密钥
						</button>
					</div>
				</form>
			</div>
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
		<section className="settings-block">
			<h3>新建模型</h3>
			<div className="settings-card">
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
					<Field label="服务商">
						<select value={provider} onChange={(event) => setProvider(event.target.value)}>
							{providers.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.name}
								</option>
							))}
						</select>
					</Field>
					<Field label="模型 ID">
						<input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="llama3.1:8b" required />
					</Field>
					<Field label="显示名">
						<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Llama 3.1 8B" />
					</Field>
					<Field label="Context window">
						<input
							value={contextWindow}
							onChange={(event) => setContextWindow(event.target.value)}
							placeholder="128000"
							inputMode="numeric"
						/>
					</Field>
					<div className="settings-row">
						<span className="settings-row-copy">
							<strong>支持 reasoning</strong>
						</span>
						<span className="settings-row-control settings-row-control-inline">
							<Switch size="small" value={reasoning} onChange={setReasoning} />
						</span>
					</div>
					<div className="settings-form-actions">
						<button type="submit" className="settings-submit">
							添加模型
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}
