import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Überblick über deine Finanzen." />
      <p className="text-sm text-muted-foreground">
        Verbinde in den Einstellungen dein erstes Konto, um Daten zu sehen.
      </p>
    </>
  );
}
