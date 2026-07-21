import { PageHeader } from "@/components/page-header";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { getAnalyticsDTO } from "@/lib/analytics/actions";

export default async function AnalysisPage() {
  const initial = await getAnalyticsDTO();
  return (
    <>
      <PageHeader title="Analyse" lead="Wofür dein Geld draufgeht." />
      <AnalysisView initial={initial} />
    </>
  );
}
