"use client";

import { Repeat, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MerchantAvatar } from "@/components/ds/merchant-avatar";
import { Money } from "@/components/ds/money";
import { cn } from "@/lib/utils";
import type { AmountTone } from "@/lib/ds/format";

/**
 * Eine Transaktionszeile: Avatar, Name mit Wiederkehr-Glyph, Meta,
 * Kategorie-Badge und rechtsbündiger Betrag.
 */
export function TransactionRow({
  name,
  meta,
  amount,
  tone = "neutral",
  category,
  categoryTone = "secondary",
  recurring,
  review,
  uncategorized,
  onClick,
}: {
  name: string;
  meta?: string;
  amount: string;
  tone?: AmountTone;
  category?: string | null;
  /** Muss eine Badge-Variante sein — nicht mit AmountTone verwechseln. */
  categoryTone?: "secondary" | "income" | "accent";
  recurring?: boolean;
  review?: boolean;
  uncategorized?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex h-16 items-center gap-3.5 rounded-md px-3 transition-colors",
        onClick && "cursor-pointer hover:bg-surface-hover",
      )}
    >
      <MerchantAvatar name={name} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink-900">{name}</span>
          {recurring && (
            <Repeat className="size-3.5 shrink-0 text-ink-400" strokeWidth={2} aria-label="Wiederkehrend" />
          )}
        </div>
        {meta && <div className="mt-0.5 text-xs text-ink-400">{meta}</div>}
      </div>

      <div className="flex items-center gap-2.5">
        {uncategorized ? (
          <Badge variant="uncat">Nicht kategorisiert</Badge>
        ) : (
          category && <Badge variant={categoryTone}>{category}</Badge>
        )}
        {review && (
          <Badge variant="review">
            <TriangleAlert className="size-3" strokeWidth={2} />
            Prüfen
          </Badge>
        )}
        <Money.Text value={amount} tone={tone} className="min-w-[104px] text-right" />
      </div>
    </div>
  );
}
