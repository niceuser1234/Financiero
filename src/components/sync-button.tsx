"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runManualSync } from "@/lib/banking/actions";

export function SyncButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState(false);

  function onClick() {
    setRunning(true);
    startTransition(async () => {
      try {
        const stats = await runManualSync();
        toast.success(`Sync fertig: ${stats.newTx} neu`, {
          description:
            stats.errors.length > 0 ? `Hinweise: ${stats.errors.join("; ")}` : `${stats.accounts} Konten abgefragt`,
        });
        router.refresh();
      } catch (e) {
        toast.error("Sync fehlgeschlagen", { description: (e as Error).message });
      } finally {
        setRunning(false);
      }
    });
  }

  const busy = pending || running;
  return (
    <Button variant={variant} onClick={onClick} disabled={busy}>
      <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} />
      {busy ? "Synchronisiere…" : "Jetzt synchronisieren"}
    </Button>
  );
}
