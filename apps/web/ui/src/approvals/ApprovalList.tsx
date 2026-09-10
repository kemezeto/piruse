import type { ViewApproval } from "@protocol/view";

export function ApprovalList({
	items,
	onAllow,
	onDeny,
}: {
	items: ViewApproval[];
	onAllow: (id: string) => void;
	onDeny: (id: string) => void;
}) {
	if (items.length === 0) return null;
	return (
		<div className="approvals">
			{items.map((item) => (
				<div className={`approval${item.reason === "dangerous" ? " danger" : ""}`} key={item.id}>
					<div className="approval-copy">
						<span className="approval-kicker">{reasonLabel(item.reason)}</span>
						<span className="approval-name">{item.toolName}</span>
						<span className="approval-args">{item.args}</span>
					</div>
					<div className="approval-actions">
						<button type="button" className="approval-deny" onClick={() => onDeny(item.id)}>
							拒绝
						</button>
						<button type="button" className="approval-allow" onClick={() => onAllow(item.id)}>
							允许
						</button>
					</div>
				</div>
			))}
		</div>
	);
}

function reasonLabel(reason: ViewApproval["reason"]): string {
	if (reason === "mutate") return "改文件";
	if (reason === "dangerous") return "危险命令";
	return "跑命令";
}
