import { AlertTriangle, CalendarClock, Repeat2, ShieldCheck } from "lucide-react";
import type { LiquidityForecastDTO } from "@/lib/analytics/actions";
import { LiquidityForecastChart } from "@/components/charts/liquidity-forecast";
import { EmptyState } from "@/components/ds/empty-state";
import { Money } from "@/components/ds/money";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LiquidityForecastCard({ data }: { data: LiquidityForecastDTO }) {
  const StatusIcon = data.atRisk ? AlertTriangle : ShieldCheck;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Liquiditätsprognose</CardTitle>
        <CardDescription>So entwickelt sich dein verfügbares Geld in den nächsten 30 Tagen.</CardDescription>
        <CardAction>
          <Badge variant={data.atRisk ? "expense" : "income"}>
            <StatusIcon data-icon="inline-start" aria-hidden="true" />
            {data.atRisk ? "Engpass möglich" : "Voraussichtlich ausreichend"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ForecastMetric label="Heute" value={data.openingFmt} />
          <ForecastMetric label="In 30 Tagen" value={data.endFmt} />
          <ForecastMetric
            label="Tiefster Stand"
            value={data.lowestFmt}
            detail={data.lowestDateFmt}
            alert={data.atRisk}
          />
          <ForecastMetric label="Ø Tagesausgaben" value={data.typicalDailySpendFmt} />
        </div>

        {data.points.length === 0 ? (
          <EmptyState
            compact
            icon={CalendarClock}
            title="Noch keine Prognose möglich"
            message="Dafür müssen regelmäßige Ein- oder Auszahlungen erkannt sein."
          />
        ) : (
          <LiquidityForecastChart points={data.points} atRisk={data.atRisk} />
        )}

        {data.events.length > 0 && (
          <div className="border-t border-hairline pt-4">
            <h3 className="text-[13px] font-semibold text-ink-900">Bekannte Bewegungen</h3>
            <ul className="mt-1 max-h-64 overflow-y-auto" aria-label="Bekannte Zahlungen der Prognose">
              {data.events.map((event, index) => {
                const EventIcon = event.kind === "pending" ? CalendarClock : Repeat2;
                return (
                  <li
                    key={`${event.date}-${event.name}-${index}`}
                    className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-sunken text-ink-500">
                      <EventIcon className="size-[17px]" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink-900">{event.name}</div>
                      <div className="text-[11.5px] text-ink-400">
                        {event.kind === "pending" ? "Vorgemerkt" : "Erwartet"} · {event.dateFmt}
                      </div>
                    </div>
                    <Money.Text
                      value={event.amountFmt}
                      tone={event.tone === "income" ? "income" : "neutral"}
                      className="text-sm"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <p className="text-[11.5px] leading-relaxed text-ink-400">
          Berechnet aus aktuellem Kontostand, Vormerkungen, typischen Tagesausgaben und erkannten
          regelmäßigen Zahlungen.
        </p>
      </CardContent>
    </Card>
  );
}

function ForecastMetric({
  label,
  value,
  detail,
  alert = false,
}: {
  label: string;
  value: string;
  detail?: string;
  alert?: boolean;
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface-raised px-3.5 py-3">
      <div className="text-[10.5px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
        {label}
      </div>
      <div
        className={`tabular font-display mt-1.5 text-[18px] font-bold tracking-[-0.01em] ${
          alert ? "text-expense-strong" : "text-ink-900"
        }`}
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 text-[11px] text-ink-400">am {detail}</div>}
    </div>
  );
}
