import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/connections">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base">Bankverbindungen</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Konten verbinden, Consent-Status und Neuverbindung.
            </CardContent>
          </Card>
        </Link>
        <Link href="/settings/import">
          <Card className="transition-colors hover:border-primary">
            <CardHeader>
              <CardTitle className="text-base">CSV-Import</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Umsätze aus DKB, Revolut oder PayPal importieren.
            </CardContent>
          </Card>
        </Link>
      </div>
      <form action={signOutAction} className="mt-8">
        <Button variant="outline" type="submit">
          Abmelden
        </Button>
      </form>
    </>
  );
}
