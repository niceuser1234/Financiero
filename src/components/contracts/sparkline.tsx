"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import type { PaymentPoint } from "@/lib/recurring/queries";

/**
 * Einzelserien-Sparkline der Zahlungshistorie. Theme-aware über currentColor
 * (erbt die Textfarbe des Containers). Kein Legend/Achsen — der Kontext benennt sie.
 */
export function Sparkline({ payments }: { payments: PaymentPoint[] }) {
  if (payments.length < 2) {
    return <p className="text-sm text-muted-foreground">Zu wenige Zahlungen für einen Verlauf.</p>;
  }
  const data = payments.map((p) => ({ date: p.date, value: Math.abs(p.amountCents) / 100, fmt: p.amountFmt }));

  return (
    <div className="h-24 w-full text-primary">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.25} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.2 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-sm">
                  <div className="font-medium">{payload[0].payload.fmt}</div>
                  <div className="text-muted-foreground">
                    {new Date(payload[0].payload.date).toLocaleDateString("de-DE")}
                  </div>
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="currentColor"
            strokeWidth={2}
            fill="url(#sparkFill)"
            dot={{ r: 2, fill: "currentColor" }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
