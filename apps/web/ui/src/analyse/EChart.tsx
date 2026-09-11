import { useEffect, useRef } from "react";
import { init, use } from "echarts/core";
import { BarChart, HeatmapChart } from "echarts/charts";
import { CalendarComponent, GridComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ECharts, EChartsCoreOption } from "echarts/core";

use([BarChart, HeatmapChart, CalendarComponent, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export function EChart({ option, className }: { option: EChartsCoreOption; className?: string }) {
	const host = useRef<HTMLDivElement>(null);
	const chart = useRef<ECharts | null>(null);

	useEffect(() => {
		const el = host.current;
		if (!el) return;
		const instance = init(el);
		chart.current = instance;
		const observer = new ResizeObserver(() => instance.resize());
		observer.observe(el);
		return () => {
			observer.disconnect();
			instance.dispose();
			chart.current = null;
		};
	}, []);

	useEffect(() => {
		chart.current?.setOption(option, true);
	}, [option]);

	return <div ref={host} className={className} />;
}
