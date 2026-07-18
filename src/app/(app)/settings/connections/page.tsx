import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/sync-button";
import { listAspsps, listConnections, reconnect, startBankConnect } from "@/lib/banking/actions";
import { formatCents } from "@/lib/money";
import { ConnectPicker } from "./connect-picker";

function consentBadge(validUntil: Date | null, status: string) {
  if (status === "expired") return <Badge variant="destructive">Abgelaufen – neu verbinden</Badge>;
  if (!validUntil) return <Badge variant="secondary">Kein Ablaufdatum</Badge>;
  const days = Math.ceil((validUntil.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days <= 0) return <Badge variant="destructive">Abgelaufen</Badge>;
  if (days <= 7) return <Badge variant="destructive">Läuft in {days} Tagen ab</Badge>;
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
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Bankverbindungen" description="DKB und Revolut via Enable Banking (PSD2)." />
        <SyncButton />
      </div>

      {sp.connected && (
        <p className="mb-4 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          Verbindung hergestellt. Starte einen Sync, um Umsätze zu laden.
        </p>
      )}
      {sp.error && (
        <p className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Fehler beim Verbinden: {decodeURIComponent(sp.error)}
        </p>
      )}

      <div className="mb-8 space-y-3">
        {conns.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Verbindung. Wähle unten deine Bank.</p>
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
                    {a.name} {a.ibanMasked && <span className="text-muted-foreground">· {a.ibanMasked}</span>}
                  </span>
                  <span className="tabular-nums">
                    {a.balanceCents != null ? formatCents(a.balanceCents, a.currency) : "–"}
                  </span>
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
            <p className="text-sm text-muted-foreground">
              Keine Banken geladen. Prüfe die Enable-Banking-Zugangsdaten (Env-Variablen).
            </p>
          ) : (
            <ConnectPicker aspsps={aspsps} action={startBankConnect} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
