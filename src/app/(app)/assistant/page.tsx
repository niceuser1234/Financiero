import { PageHeader } from "@/components/page-header";
import { FinanceChat } from "@/components/chat/finance-chat";

export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistent"
        lead="Sprich mit deinem Kontostand — Ausgaben, Verträge, Sparpotenzial."
      />
      <FinanceChat />
    </>
  );
}
