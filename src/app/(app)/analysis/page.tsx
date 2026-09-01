import { AnalysisView } from "@/components/analysis/analysis-view";
import { getAnalysisDTO } from "@/lib/analytics/actions";

export default async function AnalysisPage() {
  const initial = await getAnalysisDTO();
  return <AnalysisView initial={initial} />;
}
