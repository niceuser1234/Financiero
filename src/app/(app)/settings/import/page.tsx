import { PageHeader } from "@/components/page-header";
import { listImportAccounts } from "@/lib/import/actions";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  const accounts = await listImportAccounts();
  return (
    <>
      <PageHeader
        title="CSV-Import"
        description="Umsätze aus DKB, Revolut oder PayPal importieren. Doppelte werden automatisch übersprungen."
      />
      <ImportForm accounts={accounts} />
    </>
  );
}
