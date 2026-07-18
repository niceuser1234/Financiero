import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { SyncButton } from "@/components/sync-button";
import { CategoryDonut } from "@/components/charts/category-donut";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import { getAnalyticsDTO, getConsentWarnings } from "@/lib/analytics/actions";
import { fetchTransactions } from "@/lib/transactions/actions";

export default async function DashboardPage() {
  const [dto, warnings, accounts, review] = await Promise.all([
    getAnalyticsDTO(),
    getConsentWarnings(),
    db.select().from(bankAccounts).orderBy(asc(bankAccounts.name)),
    fetchTransactions({ needsReview: true, limit: 1 }),
  ]);

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Dashboard" description="Überblick über deine Finanzen." />
        <SyncButton />
      </div>

      {warnings.map((w) => (
        <Link key={w.aspspName} href="/settings/connections">
          <p className="mb-3 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {w.aspspName}: Bankverbindung {w.status === "expired" ? "ist abgelaufen" : `läuft in ${w.daysLeft} Tagen ab`} — jetzt neu verbinden.
          </p>
        </Link>
      ))}

      {review.count > 0 && (
        <Link href="/settings/review">
          <p className="mb-3 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
            {review.count} KI-Zuordnung{review.count === 1 ? "" : "en"} mit niedriger Sicherheit prüfen.
          </p>
        </Link>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gesamtsaldo" value={dto.totalBalanceFmt} />
        <StatTile label="Einnahmen (Monat)" value={dto.incomeFmt} tone="positive" />
        <StatTile label="Ausgaben (Monat)" value={dto.expensesFmt} tone="negative" />
        <StatTile label="Abos / Monat" value={dto.subsFmt} hint="wiederkehrend" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ausgaben nach Kategorie (Monat)</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={dto.donut} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Konten</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {accounts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  <Link href="/settings/connections" className="underline">
                    Konto verbinden
                  </Link>{" "}
                  oder CSV importieren.
                </p>
              )}
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{a.name}</span>
                  <span className="tabular-nums font-medium">
                    {a.balanceCents != null ? formatCents(a.balanceCents, a.currency) : "–"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anstehende Abbuchungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dto.upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground">Nichts in den nächsten 14 Tagen.</p>
              )}
              {dto.upcoming.map((u, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <Badge variant="secondary">{u.dateFmt}</Badge>
                    {u.name}
                  </span>
                  <span className="tabular-nums">{u.fmt}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
