import { useEffect, useState } from "react";
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
