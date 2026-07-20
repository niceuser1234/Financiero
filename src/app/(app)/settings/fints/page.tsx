import { PageHeader } from "@/components/page-header";
import { FintsConnect } from "./fints-connect";

export default function FintsPage() {
  return (
    <>
      <PageHeader title="DKB verbinden (FinTS)" />
      <p className="mb-4 max-w-prose text-sm text-muted-foreground">
        BLZ, Anmeldename, PIN und deine FinTS-Produkt-ID eingeben. Anschließend die
        Verbindung einmalig in der DKB-App per Tap bestätigen.
      </p>
      <FintsConnect />
    </>
  );
}
