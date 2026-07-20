"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startFintsConnect, confirmFintsTan } from "@/lib/banking/fints-actions";

export function FintsConnect() {
  const [phase, setPhase] = useState<"form" | "waiting" | "done">("form");
  const [challenge, setChallenge] = useState("");

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

  async function poll(connectionId: string) {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const res = await confirmFintsTan(connectionId);
        if (res.status === "connected") { setPhase("done"); toast.success("DKB verbunden"); return; }
      } catch (err) {
        toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
        setPhase("form"); return;
      }
    }
    toast.error("Zeitüberschreitung — bitte erneut versuchen");
    setPhase("form");
  }

  if (phase === "done") return <p className="text-sm text-green-600">DKB ist verbunden. Zurück zu den Bankverbindungen.</p>;
  if (phase === "waiting")
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">Bitte in der DKB-App bestätigen…</p>
        <p className="text-sm text-muted-foreground">{challenge}</p>
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
