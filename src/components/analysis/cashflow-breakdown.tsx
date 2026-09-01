import { AlertTriangle, PiggyBank, ShieldCheck } from "lucide-react";
import type { CashflowBreakdownDTO } from "@/lib/analytics/actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function CashflowBreakdown({ data }: { data: CashflowBreakdownDTO }) {
  const StatusIcon = data.isDeficit ? AlertTriangle : ShieldCheck;
  const positiveFree = Math.max(0, data.values.free);
  const used = Math.max(0, data.values.fixed) + Math.max(0, data.values.flexible) + Math.max(0, data.values.saving);
  const scale = Math.max(data.values.income, used + positiveFree, 1);
  const segments = [
    { label: "Fixkosten", value: data.values.fixed, color: "var(--chart-1)" },
    { label: "Flexible Ausgaben", value: data.values.flexible, color: "var(--chart-4)" },
    { label: "Gespart", value: data.values.saving, color: "var(--income-mid)" },
    { label: "Frei", value: positiveFree, color: "var(--chart-3)" },
  ].filter((segment) => segment.value > 0);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Freier Cashflow &amp; Sparpotenzial</CardTitle>
        <CardDescription>Was nach Ausgaben und Sparen von deinen Einnahmen übrig bleibt.</CardDescription>
        <CardAction>
          <Badge variant={data.isDeficit ? "expense" : "income"}>
            <StatusIcon data-icon="inline-start" aria-hidden="true" />
            {data.isDeficit ? "Defizit" : "Im Plus"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2.5" aria-label="Cashflow-Berechnung">
          <FlowRow label="Einnahmen" value={data.incomeFmt} tone="income" operator="" />
          <FlowRow label="Fixkosten" value={data.fixedFmt} operator="−" />
          <FlowRow label="Flexible Ausgaben" value={data.flexibleFmt} operator="−" />
          <FlowRow label="Bereits gespart" value={data.savingFmt} operator="−" />
          <div className="border-t border-hairline pt-2.5">
            <FlowRow label="Freier Cashflow" value={data.freeFmt} strong deficit={data.isDeficit} operator="=" />
          </div>
        </div>

        <div>
          <div
            className={cn(
              "flex h-3 overflow-hidden rounded-[var(--radius-pill)] bg-surface-sunken",
              data.isDeficit && "ring-1 ring-expense/40",
            )}
            role="img"
            aria-label={`Verteilung der Einnahmen: Fixkosten ${data.fixedFmt}, flexible Ausgaben ${data.flexibleFmt}, gespart ${data.savingFmt}, frei ${data.freeFmt}.`}
          >
            {segments.map((segment) => (
              <span
                key={segment.label}
                className="h-full first:rounded-l-[var(--radius-pill)] last:rounded-r-[var(--radius-pill)]"
                style={{ width: `${(segment.value / scale) * 100}%`, background: segment.color }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-ink-500">
            {segments.map((segment) => (
              <li key={segment.label} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: segment.color }} aria-hidden="true" />
                {segment.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <RatioMetric label="Sparquote" value={data.savingRateFmt ?? "–"} />
          <RatioMetric label="Fixkostenquote" value={data.fixedRateFmt ?? "–"} />
          <RatioMetric
            label="Mögliches Sparen / Jahr"
            value={data.annualPotentialFmt ?? "–"}
            wide
            icon={<PiggyBank className="size-4 text-ink-400" aria-hidden="true" />}
          />
        </div>

        <p
          className={cn(
            "rounded-md px-3.5 py-3 text-[13px] leading-relaxed",
            data.isDeficit ? "bg-expense-soft text-expense-strong" : "bg-income-soft text-income",
          )}
        >
          {data.message}
        </p>
        {data.annualPotentialFmt && (
          <p className="text-[11.5px] leading-relaxed text-ink-400">
            Die Jahresangabe ist eine Hochrechnung aus den letzten bis zu 90 Tagen – keine Garantie.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FlowRow({
  label,
  value,
  operator,
  tone = "neutral",
  strong = false,
  deficit = false,
}: {
  label: string;
  value: string;
  operator: string;
  tone?: "income" | "neutral";
  strong?: boolean;
  deficit?: boolean;
}) {
  return (
    <div className="grid grid-cols-[18px_1fr_auto] items-baseline gap-2 text-[13px]">
      <span className="text-center font-medium text-ink-400" aria-hidden="true">{operator}</span>
      <span className={cn("text-ink-500", strong && "font-semibold text-ink-900")}>{label}</span>
      <span
        className={cn(
          "tabular font-display font-semibold",
          tone === "income" && "text-income",
          tone === "neutral" && "text-ink-900",
          strong && "text-[16px] font-bold",
          deficit && "text-expense-strong",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function RatioMetric({
  label,
  value,
  wide = false,
  icon,
}: {
  label: string;
  value: string;
  wide?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-md border border-hairline bg-surface-raised px-3.5 py-3", wide && "col-span-2")}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10.5px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
          {label}
        </div>
        {icon}
      </div>
      <div className="tabular font-display mt-1.5 text-[18px] font-bold tracking-[-0.01em] text-ink-900">
        {value}
      </div>
    </div>
  );
}
