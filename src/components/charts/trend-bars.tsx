"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendBar {
  month: string;
  label: string;
  income: number; // Euro
  expense: number; // Euro (positiver Betrag)
  incomeFmt: string;
  expenseFmt: string;
}

const INCOME = "var(--income-mid)";
const EXPENSE = "var(--expense)";

export function TrendBars({ data }: { data: TrendBar[] }) {
  return (
    <div className="w-full">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={11.5}
              stroke="var(--ink-400)"
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v / 100) / 10}k`}
              tickLine={false}
              axisLine={false}
              fontSize={11.5}
              stroke="var(--ink-400)"
              width={40}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-xs shadow-ds-sm">
                    <div className="mb-1 font-medium text-ink-900">{label}</div>
                    <div style={{ color: INCOME }}>Ein: {payload[0]?.payload.incomeFmt}</div>
                    <div style={{ color: EXPENSE }}>Aus: {payload[0]?.payload.expenseFmt}</div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="income" fill={INCOME} radius={[6, 6, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" fill={EXPENSE} radius={[6, 6, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex gap-[18px] border-t border-hairline pt-3.5">
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500">
          <span className="size-[9px] rounded-[3px]" style={{ background: INCOME }} />
          Einnahmen
        </div>
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-500">
          <span className="size-[9px] rounded-[3px]" style={{ background: EXPENSE }} />
          Ausgaben
        </div>
      </div>
    </div>
  );
}
