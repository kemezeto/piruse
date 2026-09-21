import { type ReactNode, useMemo, useState } from "react";
import { Switch } from "tdesign-react";
import type { ViewProviderChoice, ViewProviderOption } from "@protocol/view";
import { ConfirmDialog } from "../dialog/Confirm";
import type { HostCommand } from "../socket";

const APIS = [
	{ id: "openai-completions", label: "OpenAI Compatible" },
	{ id: "openai-responses", label: "OpenAI Responses" },
	{ id: "anthropic-messages", label: "Anthropic Messages" },
	{ id: "google-generative-ai", label: "Google Generative AI" },
];

type Pending =
	| { kind: "provider"; id: string; name: string }
	| { kind: "key"; id: string; name: string }
	| { kind: "model"; provider: string; modelId: string; name: string };

export function ModelsPane({
	providers,
	choices,
	current,
	onCommand,
}: {
	providers: ViewProviderOption[];
	choices: ViewProviderChoice[];
	current: { provider: string; modelId: string } | null;
	onCommand: HostCommand;
}) {
	const [pending, setPending] = useState<Pending | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	return (
		<div className="settings-page">
			<div className="settings-page-head">
				<h2 className="settings-page-title">模型</h2>
			</div>
			<section className="settings-block">
				<h3>已配置</h3>
				{providers.length === 0 ? (
					<div className="settings-card">
						<p className="dialog-placeholder">还没有配置服务商。在下面搜索并保存一个模型。</p>
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
									{provider.models.map((model) => {
										const active = current?.provider === provider.id && current.modelId === model.id;
										return (
											<li key={model.id} className={model.custom ? "custom" : undefined}>
												<button
													type="button"
													className={`model-chip${active ? " active" : ""}`}
													disabled={!provider.authenticated}
													onClick={() => onCommand({ type: "setModel", provider: provider.id, modelId: model.id })}
												>
													{model.name}
													<span>{model.id}</span>
												</button>
												{model.custom ? (
													<button
														type="button"
														className="chip-delete"
														aria-label={`删除 ${model.name}`}
														onClick={() =>
															setPending({ kind: "model", provider: provider.id, modelId: model.id, name: model.name })
														}
													>
														删除
													</button>
												) : null}
											</li>
										);
									})}
								</ul>
								<div className="provider-actions">
									<button type="button" className="provider-action" onClick={() => setEditing(provider.id)}>
										修改
									</button>
									{provider.custom ? (
										<button
											type="button"
											className="provider-action danger"
											onClick={() => setPending({ kind: "provider", id: provider.id, name: provider.name })}
										>
											删除服务商
										</button>
									) : provider.authenticated ? (
										<button
											type="button"
											className="provider-action danger"
											onClick={() => setPending({ kind: "key", id: provider.id, name: provider.name })}
										>
											删除密钥
										</button>
									) : null}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
			<SetupForm
				key={editing ?? "new"}
				choices={choices}
				initialId={editing}
				onCancelEdit={() => setEditing(null)}
				onSubmit={(payload) => {
					onCommand({ type: "applyModelSetup", ...payload });
					setEditing(null);
				}}
			/>
			<ConfirmDialog
				open={Boolean(pending)}
				title={pending?.kind === "model" ? "删除模型" : pending?.kind === "provider" ? "删除服务商" : "删除密钥"}
				body={
					pending?.kind === "model"
						? `确认删除模型「${pending.name}」吗？`
						: pending?.kind === "provider"
							? `确认删除服务商「${pending.name}」及其密钥吗？`
							: `确认删除「${pending?.name ?? ""}」的密钥吗？`
				}
				confirmLabel="删除"
				danger
				onCancel={() => setPending(null)}
				onConfirm={() => {
					if (!pending) return;
					if (pending.kind === "provider") onCommand({ type: "deleteProvider", id: pending.id });
					else if (pending.kind === "key") onCommand({ type: "deleteProviderKey", provider: pending.id });
					else onCommand({ type: "deleteModel", provider: pending.provider, modelId: pending.modelId });
					setPending(null);
				}}
			/>
		</div>
	);
}

function SetupForm({
	choices,
	initialId,
	onCancelEdit,
	onSubmit,
}: {
	choices: ViewProviderChoice[];
	initialId: string | null;
	onCancelEdit: () => void;
	onSubmit: (payload: {
		provider: string;
		name?: string;
		baseUrl?: string;
		api?: string;
		apiKey?: string;
		modelId: string;
		modelName?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}) => void;
}) {
	const initial = choices.find((choice) => choice.id === initialId) ?? null;
	const [query, setQuery] = useState("");
	const [providerId, setProviderId] = useState(initial?.id ?? "");
	const [creating, setCreating] = useState(false);
	const [customId, setCustomId] = useState("");
	const [name, setName] = useState(initial?.name ?? "");
	const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
	const [api, setApi] = useState(initial?.api ?? "openai-completions");
	const [apiKey, setApiKey] = useState("");
	const [modelQuery, setModelQuery] = useState("");
	const [modelId, setModelId] = useState(initial?.models[0]?.id ?? "");
	const [newModel, setNewModel] = useState(initial ? !initial.models.some((model) => model.id === modelId) : false);
	const [modelName, setModelName] = useState("");
	const [reasoning, setReasoning] = useState(false);
	const [contextWindow, setContextWindow] = useState("");
	const selected = creating ? null : (choices.find((choice) => choice.id === providerId) ?? null);
	const providerMatches = useMemo(() => {
		const text = query.trim().toLowerCase();
		if (!text) return [];
		return choices.filter((choice) => choice.name.toLowerCase().includes(text) || choice.id.toLowerCase().includes(text)).slice(0, 8);
	}, [choices, query]);
	const modelMatches = useMemo(() => {
		const models = selected?.models ?? [];
		const text = modelQuery.trim().toLowerCase();
		const list = text ? models.filter((model) => model.name.toLowerCase().includes(text) || model.id.toLowerCase().includes(text)) : models;
		return list.slice(0, 8);
	}, [modelQuery, selected]);

	const pickProvider = (choice: ViewProviderChoice): void => {
		setCreating(false);
		setProviderId(choice.id);
		setName(choice.name);
		setBaseUrl(choice.baseUrl ?? "");
		setApi(choice.api ?? "openai-completions");
		setModelId(choice.models[0]?.id ?? "");
		setNewModel(choice.models.length === 0);
		setModelQuery("");
		setQuery("");
	};

	const reselect = (): void => {
		setCreating(false);
		setProviderId("");
		setQuery("");
		onCancelEdit();
	};

	return (
		<section className="settings-block">
			<h3>{initial ? "修改" : "配置"}</h3>
			<div className="settings-card">
				<form
					className="settings-form"
					onSubmit={(event) => {
						event.preventDefault();
						const id = creating ? customId.trim() : providerId;
						const chosenModel = newModel || creating ? modelId.trim() : modelId;
						if (!id || !chosenModel) return;
						if ((creating || !selected?.authenticated) && !apiKey.trim()) return;
						const windowSize = Number(contextWindow);
						onSubmit({
							provider: id,
							name: name.trim() || undefined,
							baseUrl: creating || selected?.custom ? baseUrl.trim() : undefined,
							api: creating || selected?.custom ? api : undefined,
							apiKey: apiKey.trim() || undefined,
							modelId: chosenModel,
							modelName: newModel || creating ? modelName.trim() || undefined : undefined,
							reasoning: newModel || creating ? reasoning : undefined,
							contextWindow: (newModel || creating) && Number.isFinite(windowSize) && windowSize > 0 ? windowSize : undefined,
						});
						setApiKey("");
					}}
				>
					{selected || creating ? null : (
						<div className="catalog-picker">
							<input
								className="catalog-search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="搜索服务商"
							/>
							<div className="catalog-list">
								{!query.trim() ? <p className="catalog-empty">输入名称筛选内置目录</p> : null}
								{query.trim() && providerMatches.length === 0 ? <p className="catalog-empty">没有匹配的服务商</p> : null}
								{providerMatches.map((choice) => (
									<button key={choice.id} type="button" className="catalog-option" onClick={() => pickProvider(choice)}>
										<span className="catalog-option-copy">
											<strong>{choice.name}</strong>
											{choice.name.toLowerCase() === choice.id.toLowerCase() ? null : <span className="catalog-id">{choice.id}</span>}
										</span>
										{choice.authenticated ? <em>已认证</em> : null}
									</button>
								))}
								<button
									type="button"
									className="catalog-option catalog-create"
									onClick={() => {
										setCreating(true);
										setNewModel(true);
										setProviderId("");
									}}
								>
									<span className="catalog-option-copy">
										<strong>自定义服务商</strong>
										<span>填写 Base URL 和密钥</span>
									</span>
								</button>
							</div>
						</div>
					)}
					{selected || creating ? (
						<>
							{creating ? (
								<Field label="ID" hint="字母开头，可含数字和连字符">
									<span className="catalog-selected">
										<input value={customId} onChange={(event) => setCustomId(event.target.value)} placeholder="ollama" required />
										<button type="button" className="catalog-reselect" onClick={reselect}>
											重新选择
										</button>
									</span>
								</Field>
							) : (
								<Field label="服务商">
									<span className="catalog-selected">
										<strong>{selected?.name}</strong>
										<button type="button" className="catalog-reselect" onClick={reselect}>
											重新选择
										</button>
									</span>
								</Field>
							)}
							{creating || selected?.custom ? (
								<>
									<Field label="显示名">
										<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ollama" />
									</Field>
									<Field label="Base URL">
										<input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:11434/v1" required />
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
								</>
							) : null}
							<Field label="API Key" hint={selected?.authenticated ? "留空表示不修改" : "不会回传到页面"}>
								<input
									type="password"
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									placeholder="sk-…"
									required={!selected?.authenticated}
								/>
							</Field>
							{selected && selected.models.length > 0 && !newModel ? (
								<>
									<div className="catalog-picker">
										<input
											className="catalog-search"
											value={modelQuery}
											onChange={(event) => setModelQuery(event.target.value)}
											placeholder="搜索模型"
										/>
										<div className="catalog-list">
											{modelQuery.trim() && modelMatches.length === 0 ? <p className="catalog-empty">没有匹配的模型</p> : null}
											{(modelQuery.trim() ? modelMatches : selected.models.slice(0, 8)).map((model) => (
												<button
													key={model.id}
													type="button"
													className={`catalog-option${model.id === modelId ? " active" : ""}`}
													onClick={() => setModelId(model.id)}
												>
													<span className="catalog-option-copy">
														<strong>{model.name}</strong>
														{model.name.toLowerCase() === model.id.toLowerCase() ? null : <span className="catalog-id">{model.id}</span>}
													</span>
												</button>
											))}
											<button type="button" className="catalog-option catalog-create" onClick={() => setNewModel(true)}>
												<span className="catalog-option-copy">
													<strong>新建模型</strong>
													<span>这个服务商里没有要使用的 ID</span>
												</span>
											</button>
										</div>
									</div>
								</>
							) : (
								<>
									<Field label="模型 ID">
										<input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="llama3.1:8b" required />
									</Field>
									<Field label="显示名">
										<input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="Llama 3.1 8B" />
									</Field>
									<Field label="Context window">
										<input value={contextWindow} onChange={(event) => setContextWindow(event.target.value)} placeholder="128000" inputMode="numeric" />
									</Field>
									<div className="settings-row">
										<span className="settings-row-copy">
											<strong>支持 reasoning</strong>
										</span>
										<span className="settings-row-control settings-row-control-inline">
											<Switch size="small" value={reasoning} onChange={setReasoning} />
										</span>
									</div>
									{selected && selected.models.length > 0 ? (
										<div className="settings-form-actions">
											<button type="button" className="provider-action" onClick={() => setNewModel(false)}>
												从已有模型里选
											</button>
										</div>
									) : null}
								</>
							)}
							<div className="settings-form-actions">
								<button type="submit" className="settings-submit">
									保存并使用
								</button>
							</div>
						</>
					) : null}
				</form>
			</div>
		</section>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
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
