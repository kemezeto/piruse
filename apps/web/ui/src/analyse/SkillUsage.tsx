import { useMemo, useState } from "react";
import { EChart } from "./EChart";
import { skillTrendOption } from "./charts";
import type { SkillStat, SkillTrendPoint, TimeGrain } from "./demo";
import { formatZhShort } from "./range";

const GRAINS: { id: TimeGrain; label: string }[] = [
	{ id: "day", label: "日" },
	{ id: "week", label: "周" },
	{ id: "month", label: "月" },
];

function formatInt(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

export function SkillUsage({
	skills,
	trend,
	total,
}: {
	skills: SkillStat[];
	trend: SkillTrendPoint[];
	total: number;
}) {
	const [grain, setGrain] = useState<TimeGrain>("month");
	const featured = useMemo(() => skills.slice(0, 6), [skills]);
	const otherCalls = useMemo(() => skills.slice(6).reduce((sum, item) => sum + item.calls, 0), [skills]);
	const max = Math.max(1, ...skills.map((item) => item.calls));
	const names = useMemo(() => [...featured.map((item) => item.name), "其他"], [featured]);
	const colors = useMemo(() => [...featured.map((item) => item.color), "#94a3b8"], [featured]);
	const option = useMemo(() => skillTrendOption(trend, names, colors, grain), [trend, names, colors, grain]);

	return (
		<section className="ov-card">
			<div className="ov-card-head">
				<h2>常用 Skills</h2>
				<span className="ov-muted">
					{formatInt(total)} 次调用 · {skills.length} 个 skill
				</span>
			</div>
			<ul className="ov-skills">
				{skills.map((item) => {
					const agent = item.agents[0];
					return (
						<li key={item.name}>
							<div className="ov-skill-copy">
								<strong>{item.name}</strong>
								<p>
									{agent ? (
										<>
											Agents <b>{agent.name}</b> {agent.calls} {Math.round(agent.share * 100)}%
										</>
									) : null}
									{item.projects.length > 0 ? (
										<span>
											{" "}
											项目: {item.projects.map((project) => `${project.name}: ${project.calls}`).join(", ")}
										</span>
									) : null}
								</p>
							</div>
							<div className="ov-track ov-skill-bar">
								<i style={{ width: `${Math.max(6, (item.calls / max) * 100)}%` }} />
							</div>
							<span className="ov-num">{item.calls}</span>
							<span className="ov-dim">{item.sessions} 个会话</span>
							<span className="ov-dim">{formatZhShort(item.lastUsed)}</span>
						</li>
					);
				})}
			</ul>
			<div className="ov-card-head wrap ov-skill-trend-head">
				<div>
					<p className="ov-kicker">Skill 使用趋势</p>
					<div className="ov-legend">
						{featured.map((item) => (
							<span key={item.name}>
								<i style={{ background: item.color }} />
								{item.name} {item.calls}
							</span>
						))}
						{otherCalls > 0 ? (
							<span>
								<i style={{ background: "#94a3b8" }} />
								其他 {otherCalls}
							</span>
						) : null}
					</div>
				</div>
				<div className="ov-pills" role="tablist" aria-label="Skill 趋势粒度">
					{GRAINS.map((item) => (
						<button
							key={item.id}
							type="button"
							role="tab"
							className={grain === item.id ? "active" : ""}
							onClick={() => setGrain(item.id)}
						>
							{item.label}
						</button>
					))}
				</div>
			</div>
			<EChart className="ov-chart ov-chart-skill" option={option} />
		</section>
	);
}
