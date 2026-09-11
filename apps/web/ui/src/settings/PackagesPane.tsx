import { Switch } from "tdesign-react";
import type { ViewPackageItem } from "@protocol/view";
import type { HostCommand } from "../socket";

export function PackagesPane({
	title,
	lead,
	empty,
	items,
	running,
	kind,
	onCommand,
}: {
	title: string;
	lead: string;
	empty: string;
	items: ViewPackageItem[];
	running: boolean;
	kind: "skill" | "extension";
	onCommand: HostCommand;
}) {
	return (
		<div className="settings-page">
			<div className="settings-page-head">
				<h2 className="settings-page-title">{title}</h2>
				<p className="settings-lead">{lead}</p>
			</div>
			<section className="settings-block">
				<h3>已安装 {items.length > 0 ? `· ${items.filter((item) => item.enabled).length}/${items.length} 启用` : ""}</h3>
				{items.length === 0 ? (
					<div className="settings-card">
						<p className="dialog-placeholder">{empty}</p>
					</div>
				) : (
					<div className="package-grid">
						{items.map((item) => (
							<div key={item.id} className={`settings-card package-card${item.enabled ? "" : " is-disabled"}`}>
								<div className="package-card-head">
									<div className="package-card-copy">
										<strong>{item.name}</strong>
										{item.description ? <p className="package-card-desc">{item.description}</p> : null}
										<p className="package-card-meta" title={item.path}>
											{item.source}
										</p>
									</div>
									<span
										className="package-card-toggle"
										title={running ? "请先停止当前运行" : item.enabled ? "已启用" : "已禁用"}
									>
										<Switch
											size="medium"
											value={item.enabled}
											disabled={running}
											label={["启用", "禁用"]}
											onChange={(enabled) =>
												onCommand(
													kind === "skill"
														? { type: "setSkillEnabled", id: item.id, enabled }
														: { type: "setExtensionEnabled", id: item.id, enabled },
												)
											}
										/>
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
