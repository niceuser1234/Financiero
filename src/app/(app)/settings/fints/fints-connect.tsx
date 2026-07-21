"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startFintsConnect, confirmFintsTan, reconnectFints } from "@/lib/banking/fints-actions";

type Phase = "form" | "reconnect" | "waiting" | "done";

export function FintsConnect({ existing }: { existing?: { id: string; status: string } | null }) {
  const initialPhase: Phase =
    existing?.status === "active" ? "done" : existing?.status === "expired" ? "reconnect" : "form";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [challenge, setChallenge] = useState("");

  const idlePhase: Phase = existing?.status === "expired" ? "reconnect" : "form";

  async function poll(connectionId: string) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await confirmFintsTan(connectionId);
        if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      } catch (err) {
        toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
        setPhase(idlePhase); return;
      }
    }
    toast.error("Zeitüberschreitung — bitte erneut versuchen");
    setPhase(idlePhase);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await startFintsConnect({
        blz: String(fd.get("blz")), user: String(fd.get("user")),
        pin: String(fd.get("pin")), endpoint: String(fd.get("endpoint")),
        productId: String(fd.get("productId")),
      });
      if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      setChallenge(res.challenge ?? "Bitte in der DKB-App bestätigen");
      setPhase("waiting");
      poll(res.connectionId);
    } catch (err) {
      toast.error("Verbindung fehlgeschlagen", { description: (err as Error).message });
    }
  }

  async function onReconnect() {
    if (!existing) return;
    try {
      const res = await reconnectFints(existing.id);
      if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      setChallenge(res.challenge ?? "Bitte in der DKB-App bestätigen");
      setPhase("waiting");
      poll(existing.id);
    } catch (err) {
      toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
    }
  }

  if (phase === "done")
    return <p className="text-sm text-income">DKB ist verbunden.</p>;

  if (phase === "waiting")
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Bitte in der DKB-App bestätigen…</p>
        <p className="text-sm text-muted-foreground">{challenge}</p>
      </div>
    );

  if (phase === "reconnect")
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">DKB-Freigabe abgelaufen</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          Die 90-Tage-Freigabe deiner DKB-Verbindung ist abgelaufen. Gib sie erneut in der
          DKB-App frei — deine Zugangsdaten sind gespeichert.
        </p>
        <Button onClick={onReconnect}>Erneut freigeben</Button>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <div><Label htmlFor="blz">BLZ</Label><Input id="blz" name="blz" defaultValue="12030000" /></div>
      <div><Label htmlFor="user">Anmeldename</Label><Input id="user" name="user" required /></div>
      <div><Label htmlFor="pin">Banking-PIN</Label><Input id="pin" name="pin" type="password" required /></div>
      <div><Label htmlFor="endpoint">FinTS-Endpoint</Label><Input id="endpoint" name="endpoint" defaultValue="https://fints.dkb.de/fints" /></div>
      <div><Label htmlFor="productId">Produkt-ID</Label><Input id="productId" name="productId" required /></div>
      <Button type="submit">Verbinden</Button>
    </form>
  );
}
