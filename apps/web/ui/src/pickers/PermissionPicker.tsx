import type { PermissionMode } from "@protocol/view";
import { Menu } from "./Menu";

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
		<Menu
			align="left"
			wide
			drop="up"
			variant="inline"
			label="默认权限"
			value="默认权限"
			hint={PERMISSIONS.find((entry) => entry.mode === mode)?.hint ?? mode}
			icon={<CheckGlyph />}
		>
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

function CheckGlyph() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<circle cx="8" cy="8" r="5.4" stroke="currentColor" strokeWidth="1.3" />
			<path d="M5.3 8.15 7.15 10l3.6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
