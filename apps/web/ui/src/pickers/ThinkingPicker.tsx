import { TipsIcon } from "tdesign-icons-react";
import type { ThinkingLevel } from "@protocol/view";
import { Menu } from "./Menu";

const LEVELS: { level: ThinkingLevel; label: string; hint: string }[] = [
	{ level: "off", label: "关闭", hint: "不推理，回复更快" },
	{ level: "minimal", label: "最低", hint: "很短推理" },
	{ level: "low", label: "低", hint: "轻度推理" },
	{ level: "medium", label: "中", hint: "中等推理" },
	{ level: "high", label: "高", hint: "深度推理" },
	{ level: "xhigh", label: "很高", hint: "更长推理" },
	{ level: "max", label: "最高", hint: "最强推理" },
];

export function ThinkingPicker({
	current,
	levels,
	onSelect,
}: {
	current: ThinkingLevel;
	levels: ThinkingLevel[];
	onSelect: (level: ThinkingLevel) => void;
}) {
	const available = LEVELS.filter((entry) => levels.includes(entry.level));
	const options = available.length > 0 ? available : LEVELS.filter((entry) => entry.level === "off");
	const selected = options.find((entry) => entry.level === current) ?? options[0];
	const locked = options.length <= 1;
	return (
		<Menu
			align="right"
			wide
			drop="up"
			variant="inline"
			label="思考"
			value={selected?.label ?? "关闭"}
			hint={locked ? "当前模型不能调思考级别" : (selected?.hint ?? "思考级别")}
			disabled={locked}
			icon={<TipsIcon size={14} />}
		>
			{(close) => (
				<div className="popover-list" role="listbox" aria-label="Thinking level">
					{options.map((entry) => {
						const active = entry.level === current;
						return (
							<button
								type="button"
								key={entry.level}
								role="option"
								aria-selected={active}
								className={`popover-item${active ? " active" : ""}`}
								onClick={() => {
									if (!active) onSelect(entry.level);
									close();
								}}
							>
								<span className="popover-item-copy">
									<span className="popover-item-title">{entry.label}</span>
									<span className="popover-item-path">{entry.hint}</span>
								</span>
							</button>
						);
					})}
				</div>
			)}
		</Menu>
	);
}
