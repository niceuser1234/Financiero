"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runManualSync } from "@/lib/banking/actions";

export function ForceSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const busy = pending || running;

  function syncNow() {
    setRunning(true);
    startTransition(async () => {
      try {
        const result = await runManualSync();
        if (result.errors.length > 0) {
          toast.warning("Abgleich mit Hinweisen beendet", {
            description: result.errors.join("; "),
          });
        } else {
          toast.success("Bankdaten sind aktuell", {
            description: `${result.newTx} neue · ${result.pendingTx} vorgemerkte Umsätze`,
          });
        }
        router.refresh();
      } catch (error) {
        toast.error("Abgleich fehlgeschlagen", { description: (error as Error).message });
      } finally {
        setRunning(false);
      }
    });
  }

  return (
    <Button
      type="button"
      size="xs"
      variant="ghost"
      onClick={syncNow}
      disabled={busy}
      title="Banksynchronisierung jetzt erzwingen"
      className="ml-1 text-ink-500"
    >
      <RefreshCw className={busy ? "size-3 animate-spin" : "size-3"} />
      {busy ? "Läuft…" : "Jetzt abgleichen"}
    </Button>
  );
}
