import type { ReactNode } from 'react';
import { CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipProps } from 'recharts';

/**
 * Chart colours. The categorical slots are the validated dark-mode steps,
 * checked against this app's chart surface (#111823): worst all-pairs CVD
 * ΔE 26.8, normal-vision ΔE 31.8, both marks above 3:1 contrast.
 * Status colours are the fixed status palette and always ship with a label.
 */
export const CHART = {
  surface: '#111823',
  series1: '#3987e5',
  series2: '#d95926',
  muted: '#64748b',
  grid: '#22303f',
  axis: '#94a3b8',
  good: '#0ca30c',
  warning: '#fab219',
} as const;

export const AXIS_PROPS = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Recessive grid: horizontal rules only, never a full mesh. */
export function ChartGrid() {
  return <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />;
}

export function ChartFrame({
  title,
  subtitle,
  action,
  children,
  height = 220,
  empty,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
  height?: number;
  /** Shown instead of the plot when there is nothing to draw yet. */
  empty?: string;
}) {
  return (
    <section className="card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {empty ? (
        <p className="py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

/** Legend rendered as text + swatch, so identity never rests on colour alone. */
export function ChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-slate-300">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function DarkTooltip({
  labelFormatter,
  valueFormatter,
}: {
  labelFormatter?: (label: string) => string;
  valueFormatter?: (value: number, name: string) => string;
}) {
  const content = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-xl bg-ink-700 px-3 py-2 text-xs shadow-lg ring-1 ring-ink-500">
        <div className="mb-1 font-semibold text-slate-200">
          {labelFormatter ? labelFormatter(String(label)) : String(label)}
        </div>
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center gap-2 tabular-nums">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-slate-400">{item.name}</span>
            <span className="ml-auto font-semibold text-slate-100">
              {valueFormatter
                ? valueFormatter(Number(item.value), String(item.name))
                : String(item.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return <Tooltip content={content} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />;
}

export { XAxis, YAxis };
