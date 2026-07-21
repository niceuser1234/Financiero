import { PageHeader } from "@/components/page-header";
import { TxView } from "@/components/transactions/tx-view";
import { fetchTransactions, getPickerCategories } from "@/lib/transactions/actions";

export default async function TransactionsPage() {
  // Server page: default window is "last 90 days" relative to request time.
  const from90 = new Date();
  from90.setUTCDate(from90.getUTCDate() - 90);
  const from = from90.toISOString().slice(0, 10);

  const [initialPage, categories] = await Promise.all([
    fetchTransactions({ from, includeTransfers: false, limit: 50 }),
    getPickerCategories(),
  ]);

  return (
    <>
      <PageHeader title="Transaktionen" lead="Alle Buchungen an einem Ort." />
      <TxView initialPage={initialPage} categories={categories} />
    </>
  );
}
