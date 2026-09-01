"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiquidityForecastDTO } from "@/lib/analytics/actions";

const ACCENT = "var(--accent)";

function compactEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function LiquidityForecastChart({
  points,
  atRisk,
}: {
  points: LiquidityForecastDTO["points"];
  atRisk: boolean;
}) {
  const description = points.length
    ? `Prognostizierter Kontostand von ${points[0].balanceFmt} bis ${points.at(-1)?.balanceFmt}.`
    : "Keine Prognosedaten verfügbar.";

  return (
    <figure aria-label="Kontostandsprognose für die nächsten 30 Tage">
      <div className="h-[230px] w-full sm:h-[280px]" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="liquidity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              fontSize={11.5}
              stroke="var(--ink-400)"
            />
            <YAxis
              tickFormatter={compactEuro}
              tickLine={false}
              axisLine={false}
              fontSize={11.5}
              stroke="var(--ink-400)"
              width={46}
            />
            <ReferenceLine
              y={0}
              stroke={atRisk ? "var(--expense)" : "var(--hairline-strong)"}
              strokeDasharray="5 4"
            />
            <Tooltip
              cursor={{ stroke: "var(--hairline-strong)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as LiquidityForecastDTO["points"][number] | undefined;
                return active && point ? (
                  <div className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs shadow-ds-sm">
                    <div className="font-medium text-ink-900">{point.label}</div>
                    <div className="mt-0.5 text-ink-500">Kontostand: {point.balanceFmt}</div>
                    {point.knownDeltaFmt && (
                      <div className="mt-0.5 text-ink-500">Bekannte Bewegung: {point.knownDeltaFmt}</div>
                    )}
                  </div>
                ) : null;
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke={ACCENT}
              strokeWidth={2.5}
              fill="url(#liquidity-fill)"
              dot={false}
              activeDot={{ r: 4, fill: ACCENT, stroke: "var(--surface)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}
