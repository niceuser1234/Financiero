import { asc } from "drizzle-orm";

import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { TxView } from "@/components/transactions/tx-view";
import { fetchTransactions, getPickerCategories } from "@/lib/transactions/actions";

export default async function TransactionsPage() {
  // Server page: default window is "last 90 days" relative to request time.
  const from90 = new Date();
  from90.setUTCDate(from90.getUTCDate() - 90);
  const from = from90.toISOString().slice(0, 10);

  const [initialPage, accounts, categories] = await Promise.all([
    fetchTransactions({ from, includeTransfers: false, limit: 50 }),
    db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).orderBy(asc(bankAccounts.name)),
    getPickerCategories(),
  ]);

  return (
    <>
      <PageHeader title="Transaktionen" lead="Alle Buchungen an einem Ort." />
      <TxView initialPage={initialPage} accounts={accounts} categories={categories} />
    </>
  );
}
