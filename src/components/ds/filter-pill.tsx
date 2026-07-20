"use client";

import { ChevronDown, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Filter-Pille. Aktiv = getönter Akzentgrund ohne Rand. */
export function FilterPill({
  children,
  active,
  count,
  dropdown,
  icon: Icon,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  count?: number;
  dropdown?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-[7px] rounded-[var(--radius-pill)] px-3.5 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
        active
          ? "border border-transparent bg-accent-soft text-[var(--accent)]"
          : "border border-hairline-strong bg-surface text-ink-700 shadow-ds-xs hover:bg-surface-hover",
      )}
    >
      {Icon && <Icon className="size-[15px]" strokeWidth={2} />}
      {children}
      {count != null && (
        <span
          className={cn(
            "tabular inline-grid h-[18px] min-w-[18px] place-items-center rounded-[var(--radius-pill)] px-1.5 text-[11px] font-semibold",
            active ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-ink-500",
          )}
        >
          {count}
        </span>
      )}
      {dropdown && <ChevronDown className="-mr-0.5 size-[15px] opacity-70" strokeWidth={2} />}
    </button>
  );
}

/** Aktiver Filter als entfernbarer Chip. */
export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label?: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-accent-soft py-1.5 pr-1.5 pl-3 text-[12.5px] font-medium text-[var(--accent)] whitespace-nowrap">
      {label && <span className="opacity-70">{label}:</span>}
      <span className="font-semibold">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Filter ${label ? `${label}: ` : ""}${value} entfernen`}
        className="grid size-[18px] place-items-center rounded-[var(--radius-pill)] transition-colors hover:bg-[rgba(34,58,122,.14)]"
      >
        <X className="size-[13px]" strokeWidth={2.5} />
      </button>
    </span>
  );
}
