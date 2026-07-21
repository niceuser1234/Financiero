import { AnalysisView } from "@/components/analysis/analysis-view";
import { getAnalyticsDTO } from "@/lib/analytics/actions";

export default async function AnalysisPage() {
  const initial = await getAnalyticsDTO();
  return <AnalysisView initial={initial} />;
}
