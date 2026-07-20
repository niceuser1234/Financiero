import { initialFor } from "@/lib/ds/format";
import { cn } from "@/lib/utils";

/**
 * Getöntes Quadrat mit der Initiale des Händlers.
 * Das DS holt bewusst keine Logos — nur der erste Buchstabe.
 */
export function MerchantAvatar({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[38px] shrink-0 place-items-center rounded-sm bg-accent-soft text-sm font-semibold text-[var(--accent)]",
        className,
      )}
    >
      {initialFor(name)}
    </span>
  );
}
