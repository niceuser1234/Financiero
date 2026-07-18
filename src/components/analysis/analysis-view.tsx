"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDonut } from "@/components/charts/category-donut";
import { TrendBars } from "@/components/charts/trend-bars";
import { getAnalyticsDTO, type AnalyticsDTO } from "@/lib/analytics/actions";

const PERIODS = [
  { key: "month", label: "Monat", days: null as number | null },
  { key: "q", label: "3 Monate", days: 90 },
  { key: "year", label: "1 Jahr", days: 365 },
];

function rangeFor(days: number | null): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (days === null) {
    const now = new Date();
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to };
  }
  return { from: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10), to };
}

export function AnalysisView({ initial }: { initial: AnalyticsDTO }) {
  const [dto, setDto] = useState(initial);
  const [period, setPeriod] = useState("month");
  const [, startTransition] = useTransition();

  function select(key: string, days: number | null) {
    setPeriod(key);
    startTransition(async () => setDto(await getAnalyticsDTO(rangeFor(days))));
  }

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-md border p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => select(p.key, p.days)}
            className={
              "rounded px-3 py-1 text-sm " +
              (period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Einnahmen</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{dto.incomeFmt}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ausgaben</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">{dto.expensesFmt}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ausgaben nach Kategorie</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryDonut data={dto.donut} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Einnahmen vs. Ausgaben (6 Monate)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendBars data={dto.trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top-Händler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {dto.topMerchants.length === 0 && <p className="text-sm text-muted-foreground">Keine Daten.</p>}
          {dto.topMerchants.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="truncate">
                {m.name} <span className="text-muted-foreground">· {m.count}×</span>
              </span>
              <span className="tabular-nums font-medium">{m.fmt}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
