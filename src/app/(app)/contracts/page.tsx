import { PageHeader } from "@/components/page-header";
import { ContractsView } from "@/components/contracts/contracts-view";
import { listRecurring } from "@/lib/recurring/queries";

export default async function ContractsPage() {
  const overview = await listRecurring();
  return (
    <>
      <PageHeader title="Verträge" lead="Abos und wiederkehrende Zahlungen." />
      <ContractsView overview={overview} />
    </>
  );
}
