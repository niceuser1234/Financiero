import Link from "next/link";
import { asc } from "drizzle-orm";
import { Calendar, Landmark, Repeat, Wallet } from "lucide-react";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/ds/kpi-card";
import { EmptyState } from "@/components/ds/empty-state";
import { Money } from "@/components/ds/money";
import { TransactionRow } from "@/components/ds/transaction-row";
import { SyncButton } from "@/components/sync-button";
import { CategoryDonut } from "@/components/charts/category-donut";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAnalyticsDTO, getConsentWarnings } from "@/lib/analytics/actions";
import { fetchTransactions } from "@/lib/transactions/actions";

export default async function DashboardPage() {
  // Server page: default window is "last 90 days" relative to request time.
  const from90 = new Date();
  from90.setUTCDate(from90.getUTCDate() - 90);
  const from = from90.toISOString().slice(0, 10);

  const [dto, warnings, accounts, review, recent] = await Promise.all([
    getAnalyticsDTO(),
    getConsentWarnings(),
    db.select().from(bankAccounts).orderBy(asc(bankAccounts.name)),
    fetchTransactions({ needsReview: true, limit: 1 }),
    fetchTransactions({
      from,
      includeTransfers: false,
      limit: 5,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        lead="Überblick über deine Finanzen."
        right={<SyncButton />}
      />

      {warnings.map((w) => (
        <Link key={w.aspspName} href="/settings/connections">
          <p className="mb-3 rounded-md bg-expense-soft px-4 py-3 text-sm text-expense-strong">
            {w.aspspName}: Bankverbindung{" "}
            {w.status === "expired" ? "ist abgelaufen" : `läuft in ${w.daysLeft} Tagen ab`} — jetzt
            neu verbinden.
          </p>
        </Link>
      ))}

      {review.count > 0 && (
        <Link href="/settings/review">
          <p className="mb-3 rounded-md bg-review-soft px-4 py-3 text-sm text-review">
            {review.count} KI-Zuordnung{review.count === 1 ? "" : "en"} mit niedriger Sicherheit
            prüfen.
          </p>
        </Link>
      )}

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Gesamtsaldo" value={dto.totalBalanceFmt} tone="accent" icon={Wallet} />
        <KpiCard label="Einnahmen / Monat" value={dto.incomeFmt} tone="income" />
        <KpiCard label="Ausgaben / Monat" value={dto.expensesFmt} tone="expense" />
        <KpiCard label="Abos / Monat" value={dto.subsFmt} tone="neutral" icon={Repeat} />
      </div>

      <div className="mb-[18px] grid gap-[18px] lg:grid-cols-[1.3fr_1fr]">
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
            <CardTitle>Konten</CardTitle>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <EmptyState
                compact
                icon={Landmark}
                title="Noch kein Konto"
                message="Verbinde dein Konto oder importiere eine CSV-Datei."
                action={
                  <Button render={<Link href="/settings/connections" />} size="sm">
                    Konto verbinden
                  </Button>
                }
              />
            ) : (
              accounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-[var(--accent)]">
                    <Landmark className="size-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{a.name}</div>
                  </div>
                  {a.balanceCents != null ? (
                    <Money cents={a.balanceCents} currency={a.currency} />
                  ) : (
                    <span className="text-sm text-ink-400">–</span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Letzte Umsätze</CardTitle>
            <CardAction>
              <Button render={<Link href="/transactions" />} variant="ghost" size="sm">
                Alle Umsätze
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-3">
            {recent.items.length === 0 ? (
              <EmptyState
                compact
                title="Noch keine Umsätze"
                message="Nach dem ersten Sync erscheinen hier deine letzten Buchungen."
              />
            ) : (
              recent.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  name={t.merchantName ?? t.counterpartyName ?? t.purpose ?? "Unbekannt"}
                  meta={new Date(t.bookingDate).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                  })}
                  amount={t.amountFmt}
                  tone={t.negative ? "neutral" : "income"}
                  category={t.categoryName}
                  categoryTone={t.negative ? "secondary" : "income"}
                  recurring={t.recurringItemId != null}
                  review={t.confidence != null && t.confidence < 0.7}
                  uncategorized={!t.categoryId && !t.isTransfer}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anstehende Abbuchungen</CardTitle>
            <CardDescription>Nächste 14 Tage</CardDescription>
          </CardHeader>
          <CardContent>
            {dto.upcoming.length === 0 ? (
              <EmptyState
                compact
                icon={Calendar}
                title="Nichts in Sicht"
                message="In den nächsten 14 Tagen steht keine Abbuchung an."
              />
            ) : (
              dto.upcoming.map((u, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-hairline py-3 last:border-0"
                >
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-surface-sunken text-ink-500">
                    <Calendar className="size-4" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink-900">{u.name}</div>
                    <div className="text-[11.5px] text-ink-400">{u.dateFmt}</div>
                  </div>
                  <Money.Text value={u.fmt} className="text-sm" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
