import { type ReactNode, useState } from "react";
import { ChevronDownIcon } from "tdesign-icons-react";
import { Popup } from "tdesign-react";

export function Menu({
	align = "right",
	wide = false,
	drop = "down",
	variant = "stacked",
	label,
	value,
	hint,
	disabled,
	icon,
	children,
}: {
	align?: "left" | "right";
	wide?: boolean;
	drop?: "down" | "up";
	variant?: "stacked" | "inline";
	label: string;
	value: string;
	hint?: string;
	disabled?: boolean;
	icon?: ReactNode;
	children: (close: () => void) => ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const placement =
		drop === "up" ? (align === "left" ? "top-left" : "top-right") : align === "left" ? "bottom-left" : "bottom-right";
	return (
		<Popup
			visible={open}
			trigger="click"
			placement={placement}
			disabled={disabled}
			destroyOnClose
			delay={0}
			overlayInnerClassName={`popover${wide ? " wide" : ""}`}
			content={children(() => setOpen(false))}
			onVisibleChange={(next) => {
				if (disabled) return;
				setOpen(next);
			}}
		>
			<button
				type="button"
				className={`menu-btn${variant === "inline" ? " inline" : ""}${open ? " open" : ""}`}
				disabled={disabled}
				aria-label={label}
				title={disabled ? "请先停止当前运行" : hint ?? value}
			>
				{icon}
				{variant === "stacked" ? <span className="menu-label">{label}</span> : null}
				<span className="menu-value">{value}</span>
				{variant === "inline" ? <ChevronDownIcon size={12} aria-hidden="true" /> : null}
			</button>
		</Popup>
	);
}
