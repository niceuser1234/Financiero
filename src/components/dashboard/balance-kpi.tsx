"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { KpiCard } from "@/components/ds/kpi-card";
import { SegmentedControl } from "@/components/ds/segmented-control";

/**
 * Gesamtsaldo vs. "Real verfügbar" (Saldo minus noch nicht abgebuchte Fixkosten
 * dieses Monats). Beantwortet: "Wie viel habe ich diesen Monat wirklich noch?"
 */
export function BalanceKpi({
  total,
  real,
  remainingFixed,
}: {
  total: string;
  real: string;
  remainingFixed: string;
}) {
  const [mode, setMode] = useState<"total" | "real">("total");
  return (
    <div className="lg:col-span-2 space-y-2">
      <SegmentedControl
        options={[
          { value: "total", label: "Gesamt" },
          { value: "real", label: "Real verfügbar" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === "total" ? (
        <KpiCard label="Gesamtsaldo" value={total} tone="accent" icon={Wallet} sublabel="Aktueller Stand" />
      ) : (
        <KpiCard
          label="Real verfügbar"
          value={real}
          tone="accent"
          icon={Wallet}
          sublabel={`Nach offenen Fixkosten (${remainingFixed})`}
        />
      )}
    </div>
  );
}
