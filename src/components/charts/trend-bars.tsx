"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendBar {
  month: string;
  label: string;
  income: number; // Euro
  expense: number; // Euro (positiver Betrag)
  incomeFmt: string;
  expenseFmt: string;
}

const INCOME = "#16a34a";
const EXPENSE = "#e11d48";

export function TrendBars({ data }: { data: TrendBar[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis
            tickFormatter={(v) => `${Math.round(v / 100) / 10}k`}
            tickLine={false}
            axisLine={false}
            fontSize={12}
            stroke="var(--muted-foreground)"
            width={40}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="mb-1 font-medium">{label}</div>
                  <div className="text-emerald-600 dark:text-emerald-400">Ein: {payload[0]?.payload.incomeFmt}</div>
                  <div className="text-rose-600 dark:text-rose-400">Aus: {payload[0]?.payload.expenseFmt}</div>
                </div>
              ) : null
            }
          />
          <Legend iconType="circle" formatter={(v) => (v === "income" ? "Einnahmen" : "Ausgaben")} />
          <Bar dataKey="income" fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
