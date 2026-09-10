import { SecuredIcon } from "tdesign-icons-react";
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
	const current = PERMISSIONS.find((entry) => entry.mode === mode) ?? PERMISSIONS[1];
	return (
		<Menu
			align="left"
			wide
			drop="up"
			variant="inline"
			label="默认权限"
			value={current.label}
			hint={current.hint}
			icon={<SecuredIcon size={14} />}
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

