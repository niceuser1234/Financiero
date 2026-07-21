import { Landmark } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ds/empty-state";
import { Money } from "@/components/ds/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { listAspsps, listConnections, reconnect, startBankConnect } from "@/lib/banking/actions";
import { ConnectPicker } from "./connect-picker";

function consentBadge(validUntil: Date | null, status: string) {
  if (status === "expired") return <Badge variant="destructive">Abgelaufen – neu verbinden</Badge>;
  if (!validUntil) return <Badge variant="secondary">Kein Ablaufdatum</Badge>;
  const days = Math.ceil((validUntil.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days <= 0) return <Badge variant="destructive">Abgelaufen</Badge>;
  if (days <= 7) return <Badge variant="review">Läuft in {days} Tagen ab</Badge>;
  return <Badge variant="secondary">Gültig bis {validUntil.toLocaleDateString("de-DE")}</Badge>;
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const [aspsps, conns] = await Promise.all([listAspsps("DE"), listConnections()]);

  return (
    <>
      <PageHeader
        title="Bankverbindungen"
        lead="DKB und Revolut via Enable Banking (PSD2)."
        right={<SyncButton />}
      />

      {sp.connected && (
        <p className="mb-4 rounded-md bg-income-soft px-4 py-2 text-sm text-income">
          Verbindung hergestellt. Starte einen Sync, um Umsätze zu laden.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-expense-soft px-4 py-2 text-sm text-expense-strong">
          Fehler beim Verbinden: {decodeURIComponent(sp.error)}
        </p>
      )}

      <div className="mb-8 space-y-3">
        {conns.length === 0 && (
          <EmptyState
            compact
            icon={Landmark}
            title="Noch keine Verbindung"
            message="Wähle unten deine Bank, um Konten zu verbinden."
          />
        )}
        {conns.map((c) => (
          <Card key={c.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{c.aspspName}</CardTitle>
              {consentBadge(c.consentValidUntil, c.status)}
            </CardHeader>
            <CardContent className="space-y-2">
              {c.accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.name}{" "}
                    {a.ibanMasked && <span className="text-ink-500">· {a.ibanMasked}</span>}
                  </span>
                  {a.balanceCents != null ? (
                    <Money cents={a.balanceCents} currency={a.currency} className="text-sm" />
                  ) : (
                    <span className="text-ink-400">–</span>
                  )}
                </div>
              ))}
              {c.provider === "enable_banking" && (
                <form action={reconnect.bind(null, c.id)} className="pt-2">
                  <Button variant="outline" size="sm" type="submit">
                    Neu verbinden
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Neue Bank verbinden</CardTitle>
        </CardHeader>
        <CardContent>
          {aspsps.length === 0 ? (
            <EmptyState
              compact
              title="Keine Banken geladen"
              message="Prüfe die Enable-Banking-Zugangsdaten (Env-Variablen)."
            />
          ) : (
            <ConnectPicker aspsps={aspsps} action={startBankConnect} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
