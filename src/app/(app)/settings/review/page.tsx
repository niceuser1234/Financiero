import { asc } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts } from "@/db/schema";
import { PageHeader } from "@/components/page-header";
import { TxView } from "@/components/transactions/tx-view";
import { fetchTransactions, getPickerCategories } from "@/lib/transactions/actions";

export default async function ReviewPage() {
  const [initialPage, accounts, categories] = await Promise.all([
    fetchTransactions({ needsReview: true, limit: 50 }),
    db.select({ id: bankAccounts.id, name: bankAccounts.name }).from(bankAccounts).orderBy(asc(bankAccounts.name)),
    getPickerCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Review-Queue"
        lead="KI-Zuordnungen mit niedriger Sicherheit (< 70 %). Korrigieren erstellt eine dauerhafte Regel."
      />
      {initialPage.count === 0 ? (
        <p className="text-sm text-muted-foreground">Nichts zu prüfen — alle Zuordnungen sind sicher.</p>
      ) : (
        <TxView initialPage={initialPage} accounts={accounts} categories={categories} baseFilter={{ needsReview: true }} />
      )}
    </>
  );
}
