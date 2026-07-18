import { asc } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { TxView } from "@/components/transactions/tx-view";
import { fetchTransactions, getPickerCategories } from "@/lib/transactions/actions";

export default async function TransactionsPage() {
  const [initialPage, accounts, categories] = await Promise.all([
    fetchTransactions({ from: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10), includeTransfers: false, limit: 50 }),
    db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).orderBy(asc(bankAccounts.name)),
    getPickerCategories(),
  ]);

  return (
    <>
      <PageHeader title="Transaktionen" description="Alle Buchungen an einem Ort." />
      <TxView initialPage={initialPage} accounts={accounts} categories={categories} />
    </>
  );
}
