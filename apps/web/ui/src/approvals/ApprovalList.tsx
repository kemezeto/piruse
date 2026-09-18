import type { ApprovalRemember, ViewApproval } from "@protocol/view";

export function ApprovalList({
	items,
	onAllow,
	onDeny,
}: {
	items: ViewApproval[];
	onAllow: (id: string, remember?: ApprovalRemember) => void;
	onDeny: (id: string) => void;
}) {
	if (items.length === 0) return null;
	return (
		<div className="approvals">
			{items.map((item) => (
				<div className={`approval${item.reason === "dangerous" || item.reason === "protected" ? " danger" : ""}`} key={item.id}>
					<div className="approval-main">
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
					{item.remember && item.remember.length > 0 ? (
						<div className="approval-remember">
							{item.remember.includes("session") ? (
								<button type="button" className="approval-remember-btn" onClick={() => onAllow(item.id, "session")}>
									{item.reason === "mutate" ? "本会话允许改文件" : "本会话允许跑命令"}
								</button>
							) : null}
							{item.remember.includes("prefix") && item.prefix ? (
								<button type="button" className="approval-remember-btn" onClick={() => onAllow(item.id, "prefix")}>
									记住 {item.prefix}
								</button>
							) : null}
							{item.remember.includes("path") ? (
								<button type="button" className="approval-remember-btn" onClick={() => onAllow(item.id, "path")}>
									本会话允许这个路径
								</button>
							) : null}
						</div>
					) : null}
				</div>
			))}
		</div>
	);
}

function reasonLabel(reason: ViewApproval["reason"]): string {
	if (reason === "mutate") return "改文件";
	if (reason === "dangerous") return "危险命令";
	if (reason === "outside") return "工作区外";
	if (reason === "protected") return "受保护路径";
	return "跑命令";
}
