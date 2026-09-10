import { useMemo, useState } from "react";
import type { ViewModelOption } from "@protocol/view";
import { Menu } from "./Menu";

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
		<Menu
			align="right"
			drop="up"
			variant="inline"
			label="模型"
			icon={<SparkleGlyph />}
			value={models.find((model) => model.provider === current.provider && model.modelId === current.modelId)?.name ?? current.modelId}
		>
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

function SparkleGlyph() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<path
				d="M8 1.6 8.95 6.05 13.4 7 8.95 7.95 8 12.4 7.05 7.95 2.6 7 7.05 6.05 8 1.6Z"
				stroke="currentColor"
				strokeWidth="1.2"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
