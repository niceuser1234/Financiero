"use client";

import { cn } from "@/lib/utils";

/** Segment-Umschalter. Aktives Segment marine gefüllt auf weißer Bahn. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex gap-0.5 rounded-md border border-hairline bg-surface p-1 shadow-ds-sm"
      aria-busy={disabled}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            disabled={disabled}
            className={cn(
              "rounded-sm whitespace-nowrap transition-colors disabled:cursor-wait disabled:opacity-65",
              size === "sm" ? "px-3 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13.5px]",
              active
                ? "bg-primary font-semibold text-primary-foreground shadow-ds-accent"
                : "font-medium text-ink-500 hover:text-ink-900",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
