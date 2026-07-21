"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/ds/kpi-card";
import { MerchantAvatar } from "@/components/ds/merchant-avatar";
import { Money } from "@/components/ds/money";
import { EmptyState } from "@/components/ds/empty-state";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { CategoryDonut } from "@/components/charts/category-donut";
import { TrendBars } from "@/components/charts/trend-bars";
import { getAnalyticsDTO, type AnalyticsDTO } from "@/lib/analytics/actions";

const PERIODS = [
  { value: "month", label: "Monat", days: null as number | null },
  { value: "quarter", label: "3 Monate", days: 90 },
  { value: "year", label: "1 Jahr", days: 365 },
] as const;

type Period = (typeof PERIODS)[number]["value"];

function rangeFor(days: number | null): { from: string; to: string } {
  const to = new Date().toISOString().slice(0, 10);
  if (days === null) {
    const now = new Date();
    return {
      from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      to,
    };
  }
  return { from: new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10), to };
}

export function AnalysisView({ initial }: { initial: AnalyticsDTO }) {
  const [dto, setDto] = useState(initial);
  const [range, setRange] = useState<Period>("month");
  const [, startTransition] = useTransition();

  function onRangeChange(value: Period) {
    setRange(value);
    const days = PERIODS.find((p) => p.value === value)?.days ?? null;
    startTransition(async () => setDto(await getAnalyticsDTO(rangeFor(days))));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analyse"
        lead="Wofür dein Geld draufgeht."
        right={
          <SegmentedControl
            options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            value={range}
            onChange={onRangeChange}
          />
        }
      />

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2">
        <KpiCard label="Einnahmen" value={dto.incomeFmt} tone="income" />
        <KpiCard label="Ausgaben" value={dto.expensesFmt} tone="expense" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ausgaben nach Kategorie</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryDonut data={dto.donut} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Einnahmen vs. Ausgaben (6 Monate)</CardTitle>
        </CardHeader>
        <CardContent>
          <TrendBars data={dto.trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top-Händler</CardTitle>
        </CardHeader>
        <CardContent>
          {dto.topMerchants.length === 0 ? (
            <EmptyState
              compact
              title="Noch keine Daten"
              message="Es gibt in diesem Zeitraum keine Umsätze."
            />
          ) : (
            dto.topMerchants.map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
              >
                <MerchantAvatar name={m.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{m.name}</div>
                  <div className="text-xs text-ink-400">{m.count} Buchungen</div>
                </div>
                <Money.Text value={m.fmt} className="min-w-[104px] text-right" />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
