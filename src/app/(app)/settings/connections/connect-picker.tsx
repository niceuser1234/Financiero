"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Aspsp } from "@/lib/banking/types";

export function ConnectPicker({
  aspsps,
  action,
}: {
  aspsps: Aspsp[];
  action: (formData: FormData) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = aspsps
    .filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 20);

  return (
    <div className="space-y-3">
      <Input placeholder="Bank suchen (z.B. DKB, Revolut)…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((a) => (
          <form key={`${a.name}-${a.country}`} action={action}>
            <input type="hidden" name="aspsp" value={a.name} />
            <input type="hidden" name="country" value={a.country} />
            <Button variant="outline" type="submit" className="w-full justify-start">
              {a.name}
            </Button>
          </form>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">Keine Treffer.</p>}
      </div>
    </div>
  );
}
