"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/ds/empty-state";
import { chartColorAt } from "@/lib/ds/format";

export interface DonutSlice {
  name: string;
  color: string;
  value: number; // Euro (positiv)
  fmt: string;
}

function formatTotal(euro: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(euro);
}

export function CategoryDonut({ data }: { data: DonutSlice[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        compact
        title="Noch keine Ausgaben"
        message="Sobald Umsätze da sind, siehst du hier die Verteilung."
      />
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  // DS-Palette der Reihe nach; ein durchgereichtes var()-Token (z. B. der
  // "Nicht kategorisiert"-Slice) behält seine eigene Farbe.
  let paletteIdx = 0;
  const colored = data.map((d) => ({
    ...d,
    color: d.color.startsWith("var(") ? d.color : chartColorAt(paletteIdx++),
  }));

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* Ring-Hintergrund */}
            <Pie
              data={[{ value: 1 }]}
              dataKey="value"
              innerRadius={55}
              outerRadius={90}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill="var(--surface-sunken)" />
            </Pie>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {colored.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs shadow-ds-sm">
                    <div className="font-medium text-ink-900">{payload[0].payload.name}</div>
                    <div className="text-ink-500">{payload[0].payload.fmt}</div>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <div className="text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
            GESAMT
          </div>
          <div className="font-display mt-0.5 text-[17px] leading-none font-bold tracking-[-0.01em] text-ink-900 tabular-nums">
            {formatTotal(total)}
          </div>
        </div>
      </div>
      <ul className="w-full flex-1 space-y-[11px]">
        {colored.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5 text-[13px] text-ink-700">
            <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="font-semibold text-ink-900 tabular-nums">{d.fmt}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
