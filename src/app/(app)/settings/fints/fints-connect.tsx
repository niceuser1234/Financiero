"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  startFintsConnect,
  confirmFintsTan,
  reconnectFints,
  type FintsConnectResult,
} from "@/lib/banking/fints-actions";

type Phase = "form" | "reconnect" | "waiting" | "done";

export function FintsConnect({ existing }: { existing?: { id: string; status: string } | null }) {
  const initialPhase: Phase =
    existing?.status === "active" ? "done" : existing?.status === "expired" ? "reconnect" : "form";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [challenge, setChallenge] = useState("");
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);
  const [manualCheck, setManualCheck] = useState(false);

  const idlePhase: Phase = existing?.status === "expired" ? "reconnect" : "form";

  function completeConnection() {
    setPendingConnectionId(null);
    setManualCheck(false);
    setPhase("done");
    toast.success("DKB verbunden");
  }

  function beginWaiting(res: FintsConnectResult) {
    setChallenge(res.challenge ?? "Bitte in der DKB-App bestätigen");
    setPendingConnectionId(res.connectionId);
    setPhase("waiting");
    if (res.automatedPollingAllowed === false) {
      setManualCheck(true);
      return;
    }
    setManualCheck(false);
    void poll(res.connectionId, res);
  }

  async function poll(connectionId: string, initial: FintsConnectResult) {
    const maxAttempts = Math.min(120, Math.max(1, initial.maxPollAttempts ?? 40));
    let waitSeconds = Math.max(3, initial.pollAfterSeconds ?? 5);
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      try {
        const res = await confirmFintsTan(connectionId);
        if (res.status === "connected") { completeConnection(); return; }
        setChallenge(res.challenge ?? "Bitte in der DKB-App bestätigen");
        if (res.automatedPollingAllowed === false) {
          setManualCheck(true);
          return;
        }
        waitSeconds = Math.max(3, res.pollIntervalSeconds ?? initial.pollIntervalSeconds ?? 5);
      } catch (err) {
        toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
        setPhase(idlePhase); return;
      }
    }
    toast.error("Zeitüberschreitung — bitte erneut versuchen");
    setPhase(idlePhase);
  }

  async function onCheckApproval() {
    if (!pendingConnectionId) return;
    setManualCheck(false);
    try {
      const res = await confirmFintsTan(pendingConnectionId);
      if (res.status === "connected") { completeConnection(); return; }
      beginWaiting(res);
    } catch (err) {
      toast.error("Freigabe fehlgeschlagen", { description: (err as Error).message });
      setPhase(idlePhase);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await startFintsConnect({
        blz: String(fd.get("blz")), user: String(fd.get("user")),
        pin: String(fd.get("pin")), endpoint: String(fd.get("endpoint")),
      });
      if (res.status === "connected") { completeConnection(); return; }
      beginWaiting(res);
    } catch (err) {
      toast.error("Verbindung fehlgeschlagen", { description: (err as Error).message });
    }
  }

  async function onReconnect() {
    if (!existing) return;
    try {
      const res = await reconnectFints(existing.id);
      if (res.status === "connected") { completeConnection(); return; }
      beginWaiting(res);
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
        {manualCheck && (
          <Button type="button" variant="outline" onClick={onCheckApproval}>
            Bestätigung prüfen
          </Button>
        )}
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
      <Button type="submit">Verbinden</Button>
    </form>
  );
}
