"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { PaymentPoint } from "@/lib/recurring/queries";

/**
 * Einzelserien-Sparkline der Zahlungshistorie. Farbe aus der DS-Chart-Palette
 * (`--chart-2`). Kein Legend/Achsen — der Kontext benennt sie.
 */
export function Sparkline({ payments }: { payments: PaymentPoint[] }) {
  if (payments.length < 2) {
    return <p className="text-sm text-ink-500">Zu wenige Zahlungen für einen Verlauf.</p>;
  }
  const data = payments.map((p) => ({ date: p.date, value: Math.abs(p.amountCents) / 100, fmt: p.amountFmt }));

  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "var(--chart-2)", strokeOpacity: 0.2 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs shadow-ds-sm">
                  <div className="font-medium text-ink-900">{payload[0].payload.fmt}</div>
                  <div className="text-ink-500">
                    {new Date(payload[0].payload.date).toLocaleDateString("de-DE")}
                  </div>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--chart-2)"
            strokeWidth={2}
            fill="url(#sparkFill)"
            dot={{ r: 2, fill: "var(--chart-2)" }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
