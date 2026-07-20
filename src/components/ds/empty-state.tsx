import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Leerzustand: Icon auf weicher Fläche, Titel, Erklärung, optionale Aktion. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title?: string;
  message?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 text-center",
        compact ? "px-6 py-7" : "px-8 py-12",
      )}
    >
      <div
        className={cn(
          "mb-3 grid place-items-center rounded-lg bg-surface-sunken text-ink-400",
          compact ? "size-11" : "size-14",
        )}
      >
        <Icon className={compact ? "size-[22px]" : "size-[26px]"} strokeWidth={1.75} />
      </div>
      {title && <div className="text-[15px] leading-snug font-semibold text-ink-900">{title}</div>}
      {message && <div className="max-w-[320px] text-[13px] leading-normal text-ink-500">{message}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
