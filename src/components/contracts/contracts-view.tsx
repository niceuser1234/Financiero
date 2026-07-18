"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Sparkline } from "./sparkline";
import { dismissRecurring, loadPayments } from "@/lib/recurring/actions";
import type { PaymentPoint, RecurringDTO, RecurringOverview } from "@/lib/recurring/queries";

function Avatar({ name, color }: { name: string; color: string }) {
  const initials = name.replace(/[^a-zA-ZäöüÄÖÜ ]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return (
    <span
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      style={{ background: color + "22", color }}
    >
      {initials}
    </span>
  );
}

function ContractCard({ item, onClick }: { item: RecurringDTO; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="h-full transition-colors hover:border-primary">
        <CardContent className="flex items-center gap-3 py-4">
          <Avatar name={item.merchantName} color={item.categoryColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 truncate font-medium">
              {item.merchantName}
              {item.priceChanged && <Badge variant="destructive" className="gap-1"><TrendingUp className="size-3" />Preis</Badge>}
              {item.status === "paused" && <Badge className="bg-amber-500 text-white hover:bg-amber-500">ausgeblieben</Badge>}
            </div>
            <div className="text-xs text-muted-foreground">
              {item.cadenceLabel}
              {item.nextRelative && item.status === "active" && ` · nächste ${item.nextRelative}`}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold tabular-nums">{item.monthlyEquivFmt}</div>
            <div className="text-[10px] text-muted-foreground">pro Monat</div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

export function ContractsView({ overview }: { overview: RecurringOverview }) {
  const router = useRouter();
  const [tab, setTab] = useState<"active" | "income" | "ended">("active");
  const [selected, setSelected] = useState<RecurringDTO | null>(null);
  const [payments, setPayments] = useState<PaymentPoint[]>([]);
  const [, startTransition] = useTransition();

  function open(item: RecurringDTO) {
    setSelected(item);
    setPayments([]);
    startTransition(async () => setPayments(await loadPayments(item.id)));
  }

  const lists = { active: overview.subscriptions, income: overview.income, ended: overview.ended };
  const current = lists[tab];

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between py-5">
          <div>
            <div className="text-sm text-muted-foreground">Abos & Verträge</div>
            <div className="text-3xl font-semibold tabular-nums">{overview.totalMonthlyFmt}</div>
            <div className="text-xs text-muted-foreground">pro Monat · {overview.activeCount} aktiv</div>
          </div>
        </CardContent>
      </Card>

      <div className="inline-flex rounded-md border p-0.5">
        {([
          ["active", `Aktiv (${overview.subscriptions.length})`],
          ["income", `Einnahmen (${overview.income.length})`],
          ["ended", `Beendet (${overview.ended.length})`],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={
              "rounded px-3 py-1 text-sm " +
              (tab === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {l}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {tab === "active"
            ? "Noch keine Abos erkannt. Nach dem ersten Sync mit einigen Monaten Historie erscheinen sie hier."
            : "Nichts hier."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {current.map((item) => (
            <ContractCard key={item.id} item={item} onClick={() => open(item)} />
          ))}
        </div>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Avatar name={selected.merchantName} color={selected.categoryColor} />
                  {selected.merchantName}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                <div>
                  <div className="text-3xl font-semibold tabular-nums">{selected.monthlyEquivFmt}</div>
                  <div className="text-sm text-muted-foreground">
                    pro Monat · {selected.cadenceLabel} · zuletzt {selected.amountLastFmt}
                  </div>
                </div>

                {selected.priceChanged && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Der Betrag hat sich zuletzt geändert.
                  </p>
                )}
                {selected.status === "paused" && (
                  <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                    Erwartete Zahlung ist ausgeblieben. Nächste erwartet:{" "}
                    {selected.nextExpectedDate && new Date(selected.nextExpectedDate).toLocaleDateString("de-DE")}
                  </p>
                )}

                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Zahlungsverlauf
                  </div>
                  <Sparkline payments={payments} />
                  <ul className="mt-2 divide-y text-sm">
                    {[...payments].reverse().slice(0, 6).map((p, i) => (
                      <li key={i} className="flex justify-between py-1.5">
                        <span className="text-muted-foreground">{new Date(p.date).toLocaleDateString("de-DE")}</span>
                        <span className="tabular-nums">{p.amountFmt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2 border-t pt-4">
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
