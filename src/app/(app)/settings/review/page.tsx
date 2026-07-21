import { CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ds/empty-state";
import { TxView } from "@/components/transactions/tx-view";
import { fetchTransactions, getPickerCategories } from "@/lib/transactions/actions";

export default async function ReviewPage() {
  const [initialPage, categories] = await Promise.all([
    fetchTransactions({ needsReview: true, limit: 50 }),
    getPickerCategories(),
  ]);

  return (
    <>
      <PageHeader
        title="Review-Queue"
        lead="KI-Zuordnungen mit niedriger Sicherheit (< 70 %). Korrigieren erstellt eine dauerhafte Regel."
      />
      {initialPage.count === 0 ? (
        <EmptyState
          compact
          icon={CircleCheck}
          title="Nichts zu prüfen"
          message="Alle Zuordnungen sind sicher."
        />
      ) : (
        <TxView
          initialPage={initialPage}
          categories={categories}
          baseFilter={{ needsReview: true }}
        />
      )}
    </>
  );
}
