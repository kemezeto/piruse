import { useMemo } from "react";
import { Robot2Icon } from "tdesign-icons-react";
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
	const groups = useMemo(() => {
		const byProvider = new Map<string, ViewModelOption[]>();
		for (const model of models) {
			const list = byProvider.get(model.provider) ?? [];
			list.push(model);
			byProvider.set(model.provider, list);
		}
		return [...byProvider];
	}, [models]);

	return (
		<Menu
			align="right"
			drop="up"
			variant="inline"
			label="模型"
			icon={<Robot2Icon size={14} />}
			value={models.find((model) => model.provider === current.provider && model.modelId === current.modelId)?.name ?? current.modelId}
		>
			{(close) => (
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
									</button>
								);
							})}
						</div>
					))}
				</div>
			)}
		</Menu>
	);
}
