/*
 * React 18 wrapper around an eCharts canvas using the C3 token-driven theme (src/lib/echarts-theme.ts).
 * The design-system `ui/chart.tsx` needs React 19 (`useEffectEvent`), so this thin wrapper is used instead.
 */
import { useEffect, useRef, useState } from 'react';
import { echarts, type ECharts, type EChartsCoreOption } from '@/lib/echarts';
import { C3_THEME_NAME, ensureC3Theme, subscribeToThemeChanges } from '@/lib/echarts-theme';
import { cn } from '@/lib/utils';

export interface ChartClickParams {
  name?: string;
  seriesName?: string;
  dataIndex?: number;
}

interface C3ChartProps {
  option: EChartsCoreOption;
  ariaLabel: string;
  /** Tailwind height class, e.g. `h-64`. */
  heightClass?: string;
  className?: string;
  onClick?: (params: ChartClickParams) => void;
}

export default function C3Chart({ option, ariaLabel, heightClass = 'h-64', className, onClick }: C3ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef(option);
  const clickRef = useRef(onClick);
  const [themeVersion, setThemeVersion] = useState(0);

  optionRef.current = option;
  clickRef.current = onClick;

  useEffect(() => {
    ensureC3Theme(echarts);
    return subscribeToThemeChanges(() => setThemeVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const chart = echarts.init(el, C3_THEME_NAME);
    chartRef.current = chart;
    chart.setOption(optionRef.current);
    chart.on('click', (params) => {
      const p = params as ChartClickParams;
      clickRef.current?.({ name: p.name, seriesName: p.seriesName, dataIndex: p.dataIndex });
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [themeVersion]);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} role="img" aria-label={ariaLabel} className={cn('w-full', heightClass, className)} />;
}
