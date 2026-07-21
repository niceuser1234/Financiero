"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Repeat, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KpiCard } from "@/components/ds/kpi-card";
import { MerchantAvatar } from "@/components/ds/merchant-avatar";
import { Money } from "@/components/ds/money";
import { EmptyState } from "@/components/ds/empty-state";
import { SegmentedControl } from "@/components/ds/segmented-control";
import { formatCents } from "@/lib/money";
import { Sparkline } from "./sparkline";
import { dismissRecurring, loadPayments } from "@/lib/recurring/actions";
import type { PaymentPoint, RecurringDTO, RecurringOverview } from "@/lib/recurring/queries";

type Tab = "aktiv" | "einnahmen" | "beendet";

const CADENCE_SECTIONS: { key: "monthly" | "quarterly" | "yearly"; label: string }[] = [
  { key: "monthly", label: "Monatlich" },
  { key: "quarterly", label: "Vierteljährlich" },
  { key: "yearly", label: "Jährlich" },
];

function CardsGrid({ items, onSelect }: { items: RecurringDTO[]; onSelect: (item: RecurringDTO) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <button key={c.id} type="button" onClick={() => onSelect(c)} className="text-left">
          <Card size="sm" className="transition-colors hover:border-[var(--accent)]">
            <CardContent className="flex items-center gap-3.5">
              <MerchantAvatar name={c.merchantName} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink-900">{c.merchantName}</span>
                  <Repeat className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} />
                  {c.priceChanged && (
                    <Badge variant="destructive" className="gap-1">
                      <TrendingUp className="size-3" />
                      Preis
                    </Badge>
                  )}
                  {c.status === "paused" && <Badge variant="review">ausgeblieben</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-ink-400">
                  {c.cadenceLabel}
                  {c.nextRelative && c.status === "active" && ` · nächste ${c.nextRelative}`}
                </div>
              </div>
              <Money.Text
                value={c.monthlyEquivFmt}
                tone={c.kind === "income" ? "income" : "neutral"}
                className="min-w-[104px] text-right"
              />
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

export function ContractsView({ overview }: { overview: RecurringOverview }) {
  const router = useRouter();
  const [status, setStatus] = useState<Tab>("aktiv");
  const [selected, setSelected] = useState<RecurringDTO | null>(null);
  const [payments, setPayments] = useState<PaymentPoint[]>([]);
  const [, startTransition] = useTransition();

  function open(item: RecurringDTO) {
    setSelected(item);
    setPayments([]);
    startTransition(async () => setPayments(await loadPayments(item.id)));
  }

  const flat = { einnahmen: overview.income, beendet: overview.ended };

  const incomeSumFmt = useMemo(() => {
    const cents = overview.income.reduce((s, r) => s + Math.round(r.monthlyEquivAbs), 0);
    return formatCents(BigInt(cents));
  }, [overview.income]);

  return (
    <div className="space-y-6">
      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-3">
        <KpiCard label="Pro Monat" value={overview.totalMonthlyFmt} tone="expense" />
        <KpiCard
          label="Aktive Verträge"
          value={String(overview.activeCount)}
          tone="neutral"
          icon={Repeat}
        />
        <KpiCard label="Einnahmen / Monat" value={incomeSumFmt} tone="income" />
      </div>

      <SegmentedControl
        options={[
          { value: "aktiv", label: `Aktiv (${overview.subscriptions.length})` },
          { value: "einnahmen", label: `Einnahmen (${overview.income.length})` },
          { value: "beendet", label: `Beendet (${overview.ended.length})` },
        ]}
        value={status}
        onChange={setStatus}
      />

      {status === "aktiv" ? (
        overview.subscriptions.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="Noch keine Verträge erkannt"
            message="Sobald wiederkehrende Buchungen auftauchen, findest du sie hier."
          />
        ) : (
          <div className="space-y-6">
            {CADENCE_SECTIONS.map(({ key, label }) =>
              overview.activeByCadence[key].length === 0 ? null : (
                <section key={key} className="space-y-3">
                  <h3 className="text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
                    {label}
                  </h3>
                  <CardsGrid items={overview.activeByCadence[key]} onSelect={open} />
                </section>
              ),
            )}
          </div>
        )
      ) : flat[status].length === 0 ? (
        <EmptyState icon={Repeat} title="Nichts hier" message="Keine Verträge in dieser Ansicht." />
      ) : (
        <CardsGrid items={flat[status]} onSelect={open} />
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <MerchantAvatar name={selected.merchantName} />
                  {selected.merchantName}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                <div>
                  <Money.Text
                    value={selected.monthlyEquivFmt}
                    tone={selected.kind === "income" ? "income" : "neutral"}
                    className="text-3xl"
                  />
                  <div className="text-sm text-ink-500">
                    pro Monat · {selected.cadenceLabel} · zuletzt {selected.amountLastFmt}
                  </div>
                </div>

                {selected.priceChanged && (
                  <p className="rounded-md bg-expense-soft px-3 py-2 text-sm text-expense-strong">
                    Der Betrag hat sich zuletzt geändert.
                  </p>
                )}
                {selected.status === "paused" && (
                  <p className="rounded-md bg-review-soft px-3 py-2 text-sm text-review">
                    Erwartete Zahlung ist ausgeblieben. Nächste erwartet:{" "}
                    {selected.nextExpectedDate &&
                      new Date(selected.nextExpectedDate).toLocaleDateString("de-DE")}
                  </p>
                )}

                <div>
                  <div className="mb-1 text-[11px] font-semibold tracking-[var(--tracking-label)] text-ink-400 uppercase">
                    Zahlungsverlauf
                  </div>
                  <Sparkline payments={payments} />
                  <ul className="mt-2 divide-y divide-hairline text-sm">
                    {[...payments]
                      .reverse()
                      .slice(0, 6)
                      .map((p, i) => (
                        <li key={i} className="flex justify-between py-1.5">
                          <span className="text-ink-500">
                            {new Date(p.date).toLocaleDateString("de-DE")}
                          </span>
                          <Money.Text value={p.amountFmt} className="text-sm" />
                        </li>
                      ))}
                  </ul>
                </div>

                <div className="flex gap-2 border-t border-hairline pt-4">
                  <a href="/transactions" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Alle Buchungen <ArrowUpRight className="size-3.5" />
                  </a>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      startTransition(async () => {
                        await dismissRecurring(selected.id);
                        toast.success("Als Abo entfernt");
                        setSelected(null);
                        router.refresh();
                      });
                    }}
                  >
                    Kein Abo
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
