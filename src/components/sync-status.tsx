import { RefreshCw } from "lucide-react";
import { getAutoSyncState } from "@/lib/banking/auto-sync";
import { ForceSyncButton } from "@/components/force-sync-button";

function lastSyncLabel(value: Date | null): string {
  if (!value) return "Erster Abgleich steht an";
  const today = new Date();
  const sameDay = value.toLocaleDateString("de-DE") === today.toLocaleDateString("de-DE");
  const time = value.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `Zuletzt heute, ${time} Uhr`
    : `Zuletzt ${value.toLocaleDateString("de-DE")}, ${time} Uhr`;
}

export async function SyncStatus() {
  const state = await getAutoSyncState();
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-md border border-hairline bg-surface px-3.5 py-2 shadow-ds-xs">
      <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-[var(--accent)]">
        <RefreshCw className="size-4" strokeWidth={2} />
      </span>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold text-ink-900">Automatisch täglich</div>
        <div className="mt-0.5 text-[11.5px] text-ink-400">{lastSyncLabel(state.lastSuccessfulAt)}</div>
      </div>
      <ForceSyncButton />
    </div>
  );
}
