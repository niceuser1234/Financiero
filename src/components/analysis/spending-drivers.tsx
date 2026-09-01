import { ArrowDownRight, ArrowUpRight, Minus, Sparkles } from "lucide-react";
import type { SpendingDriversDTO } from "@/lib/analytics/actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SpendingDrivers({ data }: { data: SpendingDriversDTO }) {
  const hasDrivers = data.items.length > 0 || data.merchantItems.length > 0;
  const summaryTone =
    data.direction === "up"
      ? "bg-expense-soft text-expense-strong"
      : data.direction === "down"
        ? "bg-income-soft text-income"
        : "bg-surface-sunken text-ink-700";

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Was deine Ausgaben verändert hat</CardTitle>
        <CardDescription>{data.comparisonLabel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-2 rounded-md bg-surface-sunken p-1">
          <ComparisonMetric label="Aktuell" value={data.currentTotalFmt} />
          <ComparisonMetric
            label={data.comparisonComplete ? "Zuvor" : "Zuvor*"}
            value={data.previousTotalFmt}
          />
          <ComparisonMetric
            label="Veränderung"
            value={data.deltaFmt}
            detail={data.deltaPctFmt ?? undefined}
            tone={data.direction}
          />
        </div>

        <p className={cn("rounded-md px-3.5 py-3 text-[13px] leading-relaxed", summaryTone)}>
          {data.summary}
        </p>

        {!hasDrivers ? (
          <div className="py-5 text-center">
            <Sparkles className="mx-auto size-5 text-ink-300" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-ink-700">Keine deutliche Veränderung</p>
            <p className="mx-auto mt-1 max-w-[300px] text-xs leading-relaxed text-ink-400">
              Sobald genug Vergleichsdaten vorhanden sind, erscheinen hier die wichtigsten Treiber.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {data.items.length > 0 && (
              <DriverList title="Kategorien" items={data.items} label="Größte Kategorien-Treiber" />
            )}
            {data.merchantItems.length > 0 && (
              <DriverList title="Händler" items={data.merchantItems} label="Größte Händler-Treiber" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DriverList({
  title,
  items,
  label,
}: {
  title: string;
  items: SpendingDriversDTO["items"];
  label: string;
}) {
  return (
    <section>
      <h3 className="mb-1 text-[10.5px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
        {title}
      </h3>
      <ol aria-label={label}>
        {items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 border-b border-hairline py-3.5 first:pt-0 last:border-0 last:pb-0"
          >
            <DriverIndicator direction={item.direction} />
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-ink-900">{item.name}</div>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-500">{item.explanation}</p>
            </div>
            <div className="text-right">
              <div className="tabular font-display text-[13.5px] font-semibold text-ink-900">
                {item.currentFmt}
              </div>
              <div
                className={cn(
                  "tabular mt-0.5 text-[11.5px] font-medium",
                  driverTextTone(item.direction),
                )}
              >
                {item.deltaFmt}
                {item.deltaPctFmt ? ` · ${item.deltaPctFmt}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ComparisonMetric({
  label,
  value,
  detail,
  tone = "flat",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: SpendingDriversDTO["direction"];
}) {
  return (
    <div className="rounded-sm bg-surface px-2.5 py-2.5 text-center shadow-ds-xs">
      <div className="text-[9.5px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
        {label}
      </div>
      <div
        className={cn(
          "tabular font-display mt-1 text-[13px] font-bold sm:text-[15px]",
          tone === "up" ? "text-expense-strong" : tone === "down" ? "text-income" : "text-ink-900",
        )}
      >
        {value}
      </div>
      {detail && <div className="tabular mt-0.5 text-[10.5px] text-ink-400">{detail}</div>}
    </div>
  );
}

function DriverIndicator({ direction }: { direction: SpendingDriversDTO["items"][number]["direction"] }) {
  if (direction === "new") return <Badge variant="expense">Neu</Badge>;
  if (direction === "gone") return <Badge variant="income">Entfallen</Badge>;
  if (direction === "up") {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-expense-soft text-expense" aria-label="Mehr Ausgaben">
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="grid size-7 place-items-center rounded-full bg-income-soft text-income" aria-label="Weniger Ausgaben">
        <ArrowDownRight className="size-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="grid size-7 place-items-center rounded-full bg-surface-sunken text-ink-400" aria-label="Unverändert">
      <Minus className="size-4" aria-hidden="true" />
    </span>
  );
}

function driverTextTone(direction: SpendingDriversDTO["items"][number]["direction"]): string {
  if (direction === "up" || direction === "new") return "text-expense";
  if (direction === "down" || direction === "gone") return "text-income";
  return "text-ink-400";
}
