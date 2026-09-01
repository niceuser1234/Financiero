import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function ReclassifyBanner({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-md bg-review-soft px-4 py-3 text-sm text-review">
      <span>
        {count} Umsatz{count === 1 ? "" : "e"} noch ohne Kategorie.
      </span>
      <Link
        href="/transactions"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        Umsätze ansehen
      </Link>
    </div>
  );
}
