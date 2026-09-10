import { useEffect, useRef, useState, type ReactNode } from "react";

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
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent): void => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onPointer);
		window.addEventListener("keydown", onKey);
		return () => {
			window.removeEventListener("pointerdown", onPointer);
			window.removeEventListener("keydown", onKey);
		};
	}, [open]);

	return (
		<div className={`menu${open ? " open" : ""}`} ref={rootRef}>
			<button
				type="button"
				className={`menu-btn${variant === "inline" ? " inline" : ""}`}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label}
				title={disabled ? "请先停止当前运行" : hint ?? value}
				onClick={() => setOpen((current) => !current)}
			>
				{icon}
				{variant === "stacked" ? <span className="menu-label">{label}</span> : null}
				<span className="menu-value">{value}</span>
				{variant === "inline" ? <ChevronIcon /> : null}
			</button>
			{open ? (
				<div className={`popover ${align}${wide ? " wide" : ""}${drop === "up" ? " up" : ""}`}>
					{children(() => setOpen(false))}
				</div>
			) : null}
		</div>
	);
}

function ChevronIcon() {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
			<path d="M2.1 3.6 5 6.5l2.9-2.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
